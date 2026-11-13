// Versão 0.4: entidades do catálogo e memória curta, frases não entendidas (navegador, servidor e
// comando aprender) e editor visual da base.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, exampleCopy } from "./helpers.js";
import { createAgent } from "../src/agent/agent.js";
import { catalogVocab, extractEntities } from "../src/agent/entities.js";
import { anonymize, isMiss } from "../src/agent/privacy.js";
import { parseMisses, groupMisses, suggestFor, correctionFor, learnText } from "../src/learn/misses.js";
import { startEditor } from "../src/editor/server.js";
import { CORE_FILES } from "../src/installer/index.js";

const cli = (...args) => spawnSync(process.execPath, [join(ROOT, "bin", "agent-generator.js"), ...args], { encoding: "utf8" });
const itens = [
  { id: "t1", nome: "Nike Air Preto", categoria: "Tênis", preco: 299, tags: ["preto", "corrida", "38"] },
  { id: "t2", nome: "Nike Revolution Azul", categoria: "Tênis", preco: 249, tags: ["azul", "corrida"] },
  { id: "t3", nome: "Adidas Run Preto", categoria: "Tênis", preco: 349, tags: ["preto"] },
  { id: "t4", nome: "Adidas Street Branco", categoria: "Tênis", preco: 199, tags: ["branco", "casual"] },
  { id: "c1", nome: "Camiseta Dry Preta", categoria: "Camisetas", preco: 79, tags: ["preto", "tamanho M"] },
  { id: "c2", nome: "Camiseta Algodão Branca", categoria: "Camisetas", preco: 59, tags: ["branco", "tamanho G"] },
];
const shop = () => createAgent({ agente: { site: "Loja" }, catalogo: { rotulo: "produtos", itens }, intencoes: { saudacao: { exemplos: ["oi", "ola"], respostas: ["Oi!"] }, contato: { exemplos: ["contato", "falar com voces"], respostas: ["Fale conosco."] } } });
const chat = (agent) => {
  let c = {};
  return (m) => {
    const r = agent.reply(m, c);
    c = r.contexto;
    return r;
  };
};

test("entidades vêm do catálogo: categoria, cor (feminino e plural), marca e tamanho", () => {
  const v = catalogVocab(itens);
  assert.deepEqual(v.cores.sort(), ["azul", "branco", "preto"]);
  assert.deepEqual(v.marcas.sort(), ["adidas", "camiseta", "nike"].filter((m) => m !== "camiseta"));
  assert.deepEqual(extractEntities("tem tênis preto da Nike até 300?", v), { categoria: "Tênis", cor: "preto", marca: "nike" });
  assert.equal(extractEntities("camisetas brancas", v).cor, "branco");
  assert.equal(extractEntities("camiseta tamanho m", v).tamanho, "m");
  assert.equal(extractEntities("tem em vermelho?", v).cor, "vermelho", "cor que não existe também é entendida");
  assert.equal(extractEntities("o mais barato", v).ordem, "asc");
});

test("busca com várias entidades e memória: e em azul, e da adidas, o mais barato, compara, o segundo", () => {
  const say = chat(shop());
  const first = say("tem tênis preto da nike até 300?");
  assert.deepEqual(first.itens.map((i) => i.id), ["t1"]);
  assert.match(first.texto, /tênis em preto da Nike/);
  assert.deepEqual(say("e em azul?").itens.map((i) => i.id), ["t2"]);
  const none = say("e da adidas?");
  assert.match(none.texto, /Não encontrei tênis em azul da Adidas até R\$\s300,00\. Tenho em: preto, branco\./);
  assert.deepEqual(none.sugestoes, ["E em preto?", "E em branco?"]);
  const cheap = say("o mais barato");
  assert.equal(cheap.itens[0].preco, 199, "o mais barato não fica preso ao teto anterior");
  const all = chat(shop());
  all("quero um tênis");
  const cmp = all("compara os dois");
  assert.equal(cmp.intencao, "comparar");
  assert.match(cmp.texto, /Comparando 2 itens/);
  assert.match(cmp.texto, /O mais em conta é Nike Revolution Azul/);
  const second = all("me fala do segundo");
  assert.equal(second.intencao, "detalhe");
  assert.equal(second.itens[0].id, "t2");
  const shirts = chat(shop());
  shirts("quero camiseta");
  assert.match(shirts("tem em vermelho?").texto, /Não encontrei camisetas em vermelho\. Tenho em: preto, branco/);
  assert.deepEqual(shirts("e em branca?").itens.map((i) => i.id), ["c2"], "a categoria continua depois do não encontrei");
});

test("privacidade: e-mail, telefone, documento, código e números longos saem da frase", () => {
  assert.equal(anonymize("sou ana@x.com, tel (11) 98888-7777, cpf 123.456.789-09, pedido AB12CD34 e 12345678"), "sou [e-mail], tel [número], cpf [documento], pedido [código] e [número]");
  assert.equal(anonymize("vocês abrem no feriado?"), "vocês abrem no feriado?");
  assert.ok(isMiss({ intencao: "nao_entendi" }) && isMiss({ intencao: "faq-provavel" }) && !isMiss({ intencao: "faq" }));
});

test("aprender: lê JSON e JSON Lines, agrupa parecidas e sugere intenção, pergunta ou nova", () => {
  assert.deepEqual(parseMisses('["abre feriado?", {"frase": "abre no feriado"}]').map((m) => m.frase), ["abre feriado?", "abre no feriado"]);
  assert.equal(parseMisses('{"frase":"a@b.com quer"}\n{"frase":"oi"}').length, 2);
  const groups = groupMisses(parseMisses(["vocês abrem no feriado?", "abrem feriado?", "qual o horário de domingo", "tem opção vegana?"].map((frase) => JSON.stringify({ frase })).join("\n")));
  assert.equal(groups[0].vezes, 2);
  const base = { faq: [{ pergunta: "Qual o horário de atendimento?", resposta: "Das 9h às 18h." }], intencoes: { saudacao: { exemplos: ["oi", "olá", "bom dia"], respostas: ["Oi!"] }, contato: { exemplos: ["falar com vocês", "contato"], respostas: ["Fale conosco."] } } };
  const s = suggestFor(groups, base);
  assert.equal(s.find((g) => /domingo/.test(g.frase)).sugestao.tipo, "faq");
  assert.equal(s.find((g) => /vegana/.test(g.frase)).sugestao.tipo, "nova");
  assert.deepEqual(correctionFor(s.find((g) => /domingo/.test(g.frase)), "sugestao"), { pergunta: "qual o horário de domingo", tipo: "faq", alvo: s.find((g) => /domingo/.test(g.frase)).sugestao.alvo });
  assert.equal(correctionFor(s[0], "nova", "Abrimos das 10h às 16h.").tipo, "nova");
  assert.match(learnText(s), /4 em 3 grupos|Frases que o agente não entendeu: 4/);
});

test("servidor do agente: memória no contexto e faltas.jsonl sem dado pessoal", async (t) => {
  const site = await exampleCopy(t);
  assert.equal(cli("criar", site).status, 0);
  const { createChatHandler } = await import(pathToFileURL(join(site, "agente", "servidor.js")).href);
  const faltas = join(site, "faltas-teste.jsonl");
  const handler = await createChatHandler({ faltas });
  const call = (body) =>
    new Promise((resolve) => {
      const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(data) { resolve({ status: this.statusCode, body: JSON.parse(data) }); } };
      handler({ body }, res);
    });
  const miss = await call({ mensagem: "xpto qwerty zzz ana@x.com" });
  assert.equal(miss.status, 200);
  const r2 = await call({ mensagem: "vocês vendem drones?", falta: true });
  assert.equal(r2.status, 202);
  const lines = (await readFile(faltas, "utf8")).trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(lines.some((l) => /\[e-mail\]/.test(l.frase)) && !lines.some((l) => /ana@x\.com/.test(l.frase)));
  const ctx = await call({ mensagem: "quero um café", contexto: { ultimos: ["cafe-cerrado", 5, "x".repeat(200)], filtros: { cor: "preto", max: 50, "bad key": 1, obj: {} } } });
  assert.equal(ctx.status, 200);
});

test("CLI aprender: relatório, --aplicar --sim só aplica o que é seguro, com backup", async (t) => {
  const site = await exampleCopy(t);
  assert.equal(cli("criar", site).status, 0);
  await writeFile(join(site, "agente", "faltas.jsonl"), ["qual o horario de domingo", "tem opção vegana?", "tem opção vegana"].map((frase) => JSON.stringify({ frase })).join("\n"));
  const r = cli("aprender", site, "--json");
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.grupos.length, 2);
  assert.match(await readFile(join(site, "agente-gerador", "APRENDER.txt"), "utf8"), /tem opção vegana/);
  const applied = JSON.parse(cli("aprender", site, "--aplicar", "--sim", "--json").stdout);
  const safe = applied.grupos.filter((g) => ["intencao", "faq"].includes(g.sugestao.tipo) && g.sugestao.confianca >= 0.8);
  assert.equal(applied.aplicadas.length, safe.length, "sem confirmação, só sugestões com confiança alta");
  assert.ok(applied.aplicadas.every((m) => !/Pergunta nova/.test(m)), "resposta nova nunca é inventada");
  // Arquivo exportado do navegador (agente.exportarFaltas()).
  await writeFile(join(site, "export.json"), JSON.stringify([{ frase: "aceitam vale refeição?", em: new Date().toISOString() }]));
  assert.equal(JSON.parse(cli("aprender", site, "--arquivo", join(site, "export.json"), "--json").stdout).grupos.length, 3);
});

test("editor: código da sessão, origem, teste do rascunho, avaliação e salvar", async (t) => {
  let saved = null;
  const base = { agente: { site: "Café" }, faq: [{ pergunta: "Qual o horário?", resposta: "Das 9h às 18h." }], intencoes: { saudacao: { exemplos: ["oi", "olá"], respostas: ["Oi!"] }, despedida: { exemplos: ["tchau", "até mais"], respostas: ["Até!"] } } };
  const ed = await startEditor({ load: async () => base, save: async (k) => ((saved = k), { backup: "b.json" }), port: 4790 });
  t.after(() => ed.stop());
  const origin = `http://127.0.0.1:${ed.port}`;
  const req = (path, { method = "GET", data, token = ed.token, headers = {} } = {}) =>
    fetch(origin + path, { method, headers: { "content-type": "application/json", ...(token ? { "x-editor-token": token } : {}), ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
  assert.equal((await req("/")).status, 403, "página sem código");
  assert.equal((await fetch(ed.url)).status, 200);
  assert.match(await (await fetch(`${origin}/editor.js`)).text(), /x-editor-token/);
  assert.equal((await req("/api/base", { token: "" })).status, 403);
  assert.equal((await req("/api/salvar", { method: "POST", data: { base }, headers: { origin: "https://site-malicioso.test" } })).status, 403);
  const loaded = await (await req("/api/base")).json();
  assert.equal(loaded.base.faq[0].pergunta, "Qual o horário?");
  assert.equal(typeof loaded.avaliacao.geral, "number");
  const draft = { ...base, faq: [...base.faq, { pergunta: "Vocês abrem no feriado?", resposta: "Sim, das 10h às 16h." }] };
  const tested = await (await req("/api/testar", { method: "POST", data: { base: draft, mensagem: "abrem no feriado?" } })).json();
  assert.match(tested.texto, /10h às 16h/);
  const ev = await (await req("/api/avaliar", { method: "POST", data: { base: draft } })).json();
  assert.ok(Array.isArray(ev.problemas));
  const ok = await (await req("/api/salvar", { method: "POST", data: { base: draft }, headers: { origin } })).json();
  assert.equal(ok.ok, true);
  assert.equal(saved.faq.length, 2);
  assert.equal((await req("/api/salvar", { method: "POST", data: "x" })).status, 200, "corpo sem base usa a base atual");
  // Outro nome de host (DNS rebinding) é recusado.
  const { request } = await import("node:http");
  const status = await new Promise((ok) => request({ host: "127.0.0.1", port: ed.port, path: "/api/base", headers: { host: "evil.test", "x-editor-token": ed.token } }, (res) => ok(res.statusCode)).end());
  assert.equal(status, 421);
});

test("instalação leva os módulos novos; widget guarda faltas; treino mostra as não entendidas", async (t) => {
  for (const f of ["entities.js", "privacy.js"]) assert.ok(CORE_FILES.includes(f), f);
  const site = await exampleCopy(t);
  assert.equal(cli("instalar", site).status, 0);
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  t.after(() => delete globalThis.localStorage);
  const w = await import(pathToFileURL(join(site, "agente", "widget.js")).href);
  assert.equal(w.rememberMiss("meu email é a@b.com"), "meu email é [e-mail]");
  assert.deepEqual(w.readMisses().map((m) => m.frase), ["meu email é [e-mail]"]);
  assert.deepEqual(w.readMisses(Date.now() + 91 * 86400000), [], "somem depois de 90 dias");
  const widget = await readFile(join(ROOT, "widget", "widget.js"), "utf8");
  assert.match(widget, /agente\.registro && !endpoint/);
  const treino = await readFile(join(ROOT, "src", "observe", "client", "treino.js"), "utf8");
  assert.match(treino, /BASE \+ "faltas"/);
  assert.doesNotMatch(treino, /\.innerHTML\s*=/);
  const editor = await readFile(join(ROOT, "src", "editor", "client", "editor.js"), "utf8");
  assert.doesNotMatch(editor, /\.innerHTML\s*=/);
});
