// Versão 0.8: fotos por etapa (galerias), perfil da pessoa logada (dados só na sessão do
// navegador), conversa mais natural (várias perguntas numa frase, empatia, tom, nome) e a
// observação descobrindo a fonte do perfil.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, cp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT } from "./helpers.js";
import { scanProject } from "../src/scanner/index.js";
import { imagesOf, dateIn } from "../src/scanner/html.js";
import { generateKnowledge } from "../src/generator/index.js";
import { createAgent } from "../src/agent/agent.js";
import { checkKnowledge } from "../src/agent/knowledge.js";
import { fillTemplate, valueAt, sanitizeUser, pickPhoto, photoRequest, firstName } from "../src/agent/context.js";
import { buildProfile, PERFIL_SETOR } from "../src/domain/profile.js";
import { SECTOR_IDS } from "../src/domain/index.js";
import { summarize, applyObservation, keyPaths, profileFits } from "../src/observe/learn.js";
import { isMiss } from "../src/agent/privacy.js";

const FIX = join(ROOT, "tests", "fixtures", "construtora");
const cli = (...args) => spawnSync(process.execPath, [join(ROOT, "bin", "agent-generator.js"), ...args], { encoding: "utf8" });
const ANA = { nome: "Ana Souza", cpf: "123.456.789-00", token: "abc", unidade: { empreendimento: "Residencial Sol", apartamento: "1203", obra: { etapa: "Áreas de lazer", percentual: 78, previsaoEntrega: "2027-03-30" } } };
let cached;
const base = async () => (cached ||= generateKnowledge(await scanProject(FIX)));
const agentWith = async (perfil = {}) => {
  const { knowledge } = await base();
  return createAgent({ ...knowledge, perfil: { ...knowledge.perfil, ...perfil } });
};

test("raio X: fotos de conteúdo com etapa, legenda e data; logo e ícone ficam de fora", () => {
  const html = `<h2 id="torre">Torre</h2><img src="/img/logo.png" alt="Logo"><img src="/i/ico.png" width="24" height="24">
    <figure data-etapa="Estrutura"><img src="a.jpg" alt="Laje"><figcaption>Laje do 3º andar</figcaption><time datetime="2026-04-02">2 abr</time></figure>
    <img src="fotos/torre-2026-05-10.jpg" alt="Fachada">`;
  const imgs = imagesOf(html);
  assert.equal(imgs.length, 2);
  assert.deepEqual(
    imgs.map((i) => [i.src, i.etapa, i.legenda, i.data, i.ancora]),
    [
      ["a.jpg", "Estrutura", "Laje do 3º andar", "2026-04-02", "torre"],
      ["fotos/torre-2026-05-10.jpg", "Torre", "Fachada", "2026-05-10", "torre"],
    ],
  );
  assert.equal(dateIn("foto de 31/12/2026"), "2026-12-31");
  assert.equal(dateIn("2026-13-01"), "");
});

test("gerar: galerias por empreendimento e etapa, setor construção e moldes de perfil desligados", async () => {
  const { knowledge, notes } = await base();
  assert.equal(knowledge.setor.id, "construcao");
  const g = knowledge.midias.galerias;
  assert.equal(g.length, 6);
  const lazer = g.find((x) => x.id === "residencial-sol-areas-de-lazer");
  assert.equal(lazer.link, "/empreendimentos/residencial-sol.html#lazer");
  assert.equal(lazer.itens.length, 3);
  assert.ok(lazer.itens.every((i) => i.src.startsWith("/empreendimentos/img/")));
  assert.equal(knowledge.perfil.ativo, false);
  assert.deepEqual(knowledge.perfil.perguntas.map((q) => q.id), ["andamento_obra", "previsao_entrega", "fotos_minha_obra"]);
  assert.equal(knowledge.perfil.pagina, "/entrar.html");
  assert.ok(notes.some((n) => /Galerias de fotos: 6 \(11 fotos\)/.test(n)));
  // Todo setor tem moldes válidos (2+ exemplos e resposta).
  for (const id of SECTOR_IDS) {
    const p = buildProfile(id);
    const { knowledge: k, problems } = checkKnowledge({ perfil: p });
    assert.equal(k.perfil.perguntas.length, p.perguntas.length, `${id}: ${problems.join("; ")}`);
  }
  assert.ok(Object.keys(PERFIL_SETOR).length >= 13);
});

test("agente: última foto de uma etapa, foto anterior, por data, por grupo e escolha quando é vago", async () => {
  const a = await agentWith();
  const r = a.reply("qual a última foto da área de lazer do residencial sol?");
  assert.equal(r.intencao, "galeria");
  assert.equal(r.imagens[0].src, "/empreendimentos/img/sol-lazer-b.jpg");
  assert.match(r.texto, /mais recente de Áreas de lazer \(Residencial Sol\), publicada em 12\/11\/2026/);
  assert.deepEqual(r.acoes[0], { rotulo: "Ver todas as fotos de Áreas de lazer", href: "/empreendimentos/residencial-sol.html#lazer" });
  assert.ok(r.sugestoes.includes("Foto anterior"));
  const prev = a.reply("foto anterior", r.contexto);
  assert.equal(prev.imagens[0].src, "/empreendimentos/img/sol-lazer-c.jpg");
  assert.equal(a.reply("primeira foto da fundação").imagens[0].src, "/empreendimentos/img/verde-fundacao.jpg");
  assert.equal(a.reply("foto de 15/03/2026 do alicerce").imagens[0].src, "/empreendimentos/img/sol-alicerce-2.jpg");
  assert.equal(a.reply("Fotos de Residencial Sol").imagens[0].src, "/empreendimentos/img/sol-lazer-b.jpg");
  const vague = a.reply("tem fotos da obra?");
  assert.equal(vague.intencao, "galeria_escolher");
  assert.deepEqual(vague.sugestoes, ["Fotos de Parque Verde", "Fotos de Residencial Sol"]);
  assert.ok(isMiss({ intencao: "galeria_escolher" }) === false);
  // "minha/meu" com os dados do site: o condomínio da pessoa.
  assert.equal(a.reply("fotos da área de lazer do meu condomínio", {}, { usuario: { empreendimento: "Parque Verde" } }).imagens[0].src, "/empreendimentos/img/verde-lazer-2.jpg");
});

test("perfil: sem dados pede login; com dados responde com o nome, a etapa e a foto da etapa da obra dela", async () => {
  const off = await agentWith();
  assert.notEqual(off.reply("como está a obra do meu apartamento?").intencao, "perfil__andamento_obra", "desligado não treina o perfil");
  const a = await agentWith({ ativo: true });
  const anon = a.reply("como está a obra do meu apartamento?");
  assert.equal(anon.intencao, "perfil__andamento_obra");
  assert.equal(anon.precisaLogin, undefined, "a resposta pública não carrega flags internas além de perfil");
  assert.deepEqual(anon.perfil, { id: "andamento_obra" });
  assert.deepEqual(anon.acoes, [{ rotulo: "Entrar na conta", href: "/entrar.html" }]);
  const r = a.reply("como está a obra do meu apartamento?", {}, { usuario: ANA });
  assert.match(r.texto, /^Ana, a unidade 1203 do Residencial Sol está na etapa Áreas de lazer, com 78% concluído\. A foto mais recente de Áreas de lazer \(Residencial Sol\)/);
  assert.equal(r.imagens[0].src, "/empreendimentos/img/sol-lazer-b.jpg");
  assert.match(a.reply("quando vou receber as chaves", {}, { usuario: ANA }).texto, /previsão de entrega da unidade 1203 \(Residencial Sol\) é 30\/03\/2027/);
  // Campo faltando: não inventa, aponta a página da conta.
  const missing = a.perfil("previsao_entrega", { nome: "Ana" });
  assert.match(missing.texto, /Não encontrei a previsão de entrega nos dados da sua conta/);
  // O widget completa a resposta do servidor localmente (agent.perfil), sem mandar os dados.
  assert.match(a.perfil("andamento_obra", ANA).texto, /etapa Áreas de lazer/);
  assert.equal(a.saudacao(ANA).texto.startsWith("Oi, Ana! Sou o assistente"), true);
});

test("contexto: moldes com trechos opcionais, apelidos, limpeza de dados sensíveis e escolha da foto", () => {
  const apelidos = { previsao: ["previsaoEntrega"] };
  assert.deepEqual(fillTemplate("Pedido {pedido} está {status}.[ Rastreio: {rastreio}.]", { pedido: 7, status: "enviado" }), { texto: "Pedido 7 está enviado.", faltando: [] });
  assert.equal(fillTemplate("Entrega {previsao}", { obra: { previsaoEntrega: "2027-01-05" } }, { apelidos }).texto, "Entrega 05/01/2027");
  assert.deepEqual(fillTemplate("{x} e {y}", { x: 1 }).faltando, ["y"]);
  assert.equal(valueAt({ a: { percentualConcluido: 50 } }, "percentual"), 50);
  const clean = sanitizeUser(ANA);
  assert.equal(clean.cpf, undefined);
  assert.equal(clean.token, undefined);
  assert.equal(clean.unidade.apartamento, "1203");
  assert.equal(firstName({ name: "Bruno Lima" }), "Bruno");
  const g = { itens: [{ src: "a", data: "2026-01-01", ordem: 0 }, { src: "b", data: "2026-03-01", ordem: 1 }, { src: "c", data: "", ordem: 2 }] };
  assert.equal(pickPhoto(g).src, "b");
  assert.equal(pickPhoto(g, { modo: "primeira" }).src, "a");
  assert.equal(pickPhoto({ itens: [{ src: "x", ordem: 0 }, { src: "y", ordem: 1 }] }).src, "y");
  assert.deepEqual(photoRequest("primeira foto"), { modo: "primeira", data: "" });
  assert.equal(photoRequest("foto de 2/3/2026").data, "2026-03-02");
  // Fonte de outro domínio é recusada (dados da conta só do próprio site).
  const { knowledge, problems } = checkKnowledge({ perfil: { ativo: true, fonte: "https://outro.com/api/me", perguntas: [] } });
  assert.equal(knowledge.perfil.fonte, "");
  assert.ok(problems.some((p) => /perfil.fonte/.test(p)));
});

test("conversa: duas perguntas numa frase, botões com o assunto, empatia e tom", async () => {
  const a = await agentWith();
  const r = a.reply("qual o horário de atendimento e vocês aceitam financiamento?");
  assert.equal(r.intencao, "multipla");
  assert.match(r.texto, /^Sobre “qual o horário de atendimento”: Atendemos de segunda.*E sobre “vocês aceitam financiamento”: Sim\./);
  assert.deepEqual(r.acoes.map((x) => x.href), ["/#horario", "/#financiamento"]);
  assert.ok(r.acoes.every((x) => x.rotulo.startsWith("Saiba mais: ")));
  const angry = a.reply("isso é um absurdo, ninguém responde meu email");
  assert.equal(angry.intencao, "acolhimento");
  assert.match(angry.texto, /^Sinto muito pelo transtorno\. Quero que isso seja resolvido\. Você fala com a equipe/);
  assert.ok(angry.acoes.some((x) => x.href === "/contato.html"));
  // Tom neutro: só o conteúdo da base, sem frase de abertura.
  const { knowledge } = await base();
  const neutral = createAgent({ ...knowledge, agente: { ...knowledge.agente, tom: "neutro" } });
  const texts = [0, 1, 2, 3].map((v) => neutral.reply("como funciona a vistoria de entrega?", { voltas: v }).texto);
  assert.ok(texts.every((t) => t.startsWith("Quando a obra termina")));
  const friendly = [0, 1, 2, 3].map((v) => a.reply("como funciona a vistoria de entrega?", { voltas: v }).texto);
  assert.ok(new Set(friendly).size >= 2, "tom amigável varia a abertura");
});

test("observação: /api/minha-unidade com sessão vira fonte do perfil (só nomes de campos)", async () => {
  const { knowledge } = await base();
  const obs = summarize({
    events: [],
    exchanges: [{ metodo: "GET", caminho: "/api/minha-unidade", original: "/api/minha-unidade", status: 200, comSessao: true, query: [], resposta: { nome: "Ana", unidade: { empreendimento: "Sol", apartamento: "1203", obra: { etapa: "Torre", percentual: 40, previsaoEntrega: "2027-01-01" } } } }],
  });
  assert.equal(obs.perfis.length, 1);
  assert.ok(obs.perfis[0].campos.includes("unidade.obra.etapa"));
  assert.ok(!JSON.stringify(obs.perfis).includes("Ana"), "valores não vão para o relatório");
  const { knowledge: k, changes } = applyObservation(knowledge, obs);
  assert.equal(k.perfil.fonte, "/api/minha-unidade");
  assert.equal(k.perfil.ativo, true);
  assert.match(changes.perfil, /liga: andamento_obra, previsao_entrega, fotos_minha_obra/);
  assert.deepEqual(keyPaths({ a: [{ b: 1 }], c: "x" }), ["a.b", "c"]);
  assert.deepEqual(profileFits([{ id: "x", resposta: "{z}" }], ["a"]), []);
});

test("CLI perfil: liga com --fonte, testa com dados de exemplo e recusa fonte externa", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "ag-08-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const site = join(dir, "site");
  await cp(FIX, site, { recursive: true });
  assert.equal(cli("criar", site, "--json").status, 0);
  const user = join(dir, "usuario.json");
  await writeFile(user, JSON.stringify(ANA));
  const r = cli("perfil", site, "--fonte", "/api/minha-unidade", "--testar", user, "--json");
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.perfil.ativo, true);
  assert.equal(out.galerias, 6);
  assert.match(out.testes[0].resposta, /Ana, a unidade 1203/);
  assert.equal(out.testes[0].fotos[0], "/empreendimentos/img/sol-lazer-b.jpg");
  const saved = JSON.parse(await readFile(join(site, "agente", "conhecimento", "perfil.json"), "utf8"));
  assert.equal(saved.fonte, "/api/minha-unidade");
  const bad = cli("perfil", site, "--fonte", "https://outro.com/api");
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /caminho do próprio site/);
});

test("widget: WhatsApp com resumo da conversa e dados do usuário só na sessão (sem campos sensíveis)", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "ag-08w-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const site = join(dir, "site");
  await cp(FIX, site, { recursive: true });
  assert.equal(cli("criar", site).status, 0);
  const { pathToFileURL } = await import("node:url");
  const store = new Map();
  globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  t.after(() => delete globalThis.sessionStorage);
  const w = await import(pathToFileURL(join(site, "agente", "widget.js")).href);
  const msgs = [{ de: "bot", texto: "Oi" }, { de: "voce", texto: "como está minha obra?" }, { de: "voce", texto: "quero falar com alguém" }];
  assert.equal(w.handoffText(msgs, "Construtora Horizonte"), 'Olá! Vim pelo assistente de Construtora Horizonte. Minhas dúvidas: "como está minha obra?"; "quero falar com alguém".');
  const link = new URL(w.withHandoff("https://wa.me/5511988887777", msgs, "X"));
  assert.match(link.searchParams.get("text"), /Minhas dúvidas: "como está minha obra\?"/);
  assert.equal(w.withHandoff("/contato.html", msgs, "X"), "/contato.html");
  const saved = w.cacheUser(ANA, 15, 1000);
  assert.equal(saved.cpf, undefined);
  assert.ok(!store.get("agente_usuario_v1").includes("123.456"));
  assert.equal(w.readCachedUser(1000 + 14 * 60000).unidade.apartamento, "1203");
  assert.equal(w.readCachedUser(1000 + 16 * 60000), null, "expira");
  w.cacheUser(null);
  assert.equal(store.has("agente_usuario_v1"), false);
});
