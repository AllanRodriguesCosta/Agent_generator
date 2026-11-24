// Versão 0.7: bases comuns por setor (glossário e sinônimos em português e inglês), base
// complementar de conteúdos (resumos extrativos com link) e mapa de interações do site, com
// recuperação em etapas quando o agente não entende ("Você quis dizer...?" e atendimento humano).
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, cp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT, EXAMPLE } from "./helpers.js";
import { scanProject } from "../src/scanner/index.js";
import { generateKnowledge } from "../src/generator/index.js";
import { createAgent } from "../src/agent/agent.js";
import { checkKnowledge } from "../src/agent/knowledge.js";
import { detectSector, textsFromReport } from "../src/domain/detect.js";
import { SECTORS } from "../src/domain/sectors.js";
import { sentences, summarize, buildContents, docLink } from "../src/domain/contents.js";
import { mapInteractions, classifyInteraction, dedupeFields, shortTitle } from "../src/domain/interactions.js";
import { enrichFromObservation } from "../src/domain/index.js";
import { isMiss } from "../src/agent/privacy.js";

const CLINIC = join(ROOT, "tests", "fixtures", "clinica");
const cli = (...args) => spawnSync(process.execPath, [join(ROOT, "bin", "agent-generator.js"), ...args], { encoding: "utf8" });
async function copy(t, from) {
  const dir = await mkdtemp(join(tmpdir(), "ag-07-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await cp(from, join(dir, "site"), { recursive: true, filter: (src) => !/[\\/](agente|agente-gerador)([\\/]|$)/.test(src.slice(from.length)) });
  return join(dir, "site");
}
const clinic = async () => {
  const report = await scanProject(CLINIC);
  return { report, ...generateKnowledge(report) };
};

test("bases setoriais: todo setor tem sinais, glossário com definição e sinônimos bilíngues", () => {
  assert.ok(SECTORS.length >= 12);
  const ids = new Set();
  for (const s of SECTORS) {
    assert.ok(!ids.has(s.id), s.id);
    ids.add(s.id);
    assert.ok(s.sinais.length >= 10, `${s.id}: sinais`);
    assert.ok(s.glossario.length >= 6, `${s.id}: glossário`);
    for (const g of s.glossario) assert.ok(g.termo && g.definicao.length >= 30 && g.sinonimos.length, `${s.id}/${g.termo}`);
    assert.ok(s.sinonimos.every((grupo) => grupo.length >= 2), `${s.id}: sinônimos`);
    // Termos em inglês comuns no setor também contam (shipping, appointment, quote...).
    assert.ok([...s.sinais.map(([t]) => t), ...s.glossario.flatMap((g) => g.sinonimos)].some((t) => /^[a-z ]+!?$/.test(t) && /(ing|ment|tion|ance|er|ce|ts?|ck|y|ss|ow|al|ce|ip|up)!?$/.test(t)), `${s.id}: inglês`);
  }
});

test("detecção de setor: clínica = saúde, café = alimentação + varejo, sem sinal = geral, escolha manual", async () => {
  const { report } = await clinic();
  const d = detectSector(textsFromReport(report));
  assert.equal(d.setor, "saude");
  assert.ok(d.confianca >= 0.8);
  assert.ok(d.ranking[0].evidencias.some((e) => /schema\.org\/MedicalClinic/.test(e) || /clinic/.test(e)));
  const cafe = detectSector(textsFromReport(await scanProject(EXAMPLE)));
  assert.equal(cafe.setor, "alimentacao");
  assert.equal(cafe.ranking[1].id, "varejo", "varejo em segundo, mas longe o bastante para não misturar glossários");
  // "cart" (inglês) é palavra exata: "cartão" não conta como carrinho.
  const card = detectSector({ destaque: ["Pague no cartão", "cartão de crédito", "cartões"], corpo: [] });
  assert.equal(card.ranking.find((r) => r.id === "varejo").evidencias.some((e) => /^cart /.test(e)), false);
  assert.equal(detectSector({ destaque: ["Olá mundo"], corpo: ["Uma página qualquer."] }).setor, "geral");
  assert.equal(detectSector(textsFromReport(report), { forcar: "juridico" }).setor, "juridico");
});

test("conteúdos: resumo extrativo (TextRank) com frases do próprio texto e link; README e docs de desenvolvimento ficam de fora", async () => {
  assert.deepEqual(sentences("O Dr. Silva atende às terças-feiras pela manhã. O valor é R$ 1.500,00 por sessão completa."), ["O Dr. Silva atende às terças-feiras pela manhã.", "O valor é R$ 1.500,00 por sessão completa."]);
  const text = "A reciclagem de eletrônicos evita que metais pesados contaminem o solo. Baterias e placas têm chumbo, mercúrio e cádmio. O descarte correto permite recuperar metais valiosos como ouro e cobre. A reciclagem de eletrônicos também gera empregos na cadeia de coleta. Muita gente guarda aparelhos velhos em casa por não saber onde descartar.";
  const r = summarize(text, { titulo: "Reciclagem de eletrônicos" });
  for (const s of sentences(r)) assert.ok(text.includes(s), "só frases do texto original");
  assert.ok(sentences(r).length <= 2 && r.length <= 420);
  const { knowledge } = await clinic();
  const checkup = knowledge.conteudos.find((c) => /check-up anual/i.test(c.titulo));
  assert.equal(checkup.link, "/blog/check-up.html");
  assert.match(checkup.resumo, /check-up anual é um conjunto de consultas/);
  const docs = buildContents({
    documentos: [
      { arquivo: "README.md", titulo: "Projeto", secoes: [{ titulo: "Instalação", texto: "Rode npm install. Depois rode npm start para subir o servidor na porta 3000 e abra o navegador." }] },
      { arquivo: "docs/DEPLOY.md", titulo: "Deploy", secoes: [{ titulo: "Render", texto: "Crie o serviço no Render. Configure as variáveis de ambiente e publique o projeto pela branch principal." }] },
      { arquivo: "content/blog/descarte.md", titulo: "Descarte", secoes: [{ titulo: "Onde descartar pilhas", texto: "Pilhas e baterias não podem ir para o lixo comum. Supermercados e lojas de eletrônicos costumam ter coletores gratuitos para esse descarte." }] },
    ],
  });
  assert.deepEqual(docs.map((c) => [c.titulo, c.link]), [["Onde descartar pilhas", "/blog/descarte"]]);
  assert.equal(docLink("src/pages/guias/index.mdx"), "/guias");
});

test("interações: formulários, schema.org e páginas viram 'o que dá para fazer', sem senha e sem API", async () => {
  assert.equal(classifyInteraction("Trabalhe conosco - envie seu currículo")?.tipo, "candidatura");
  assert.equal(classifyInteraction("Seja um fornecedor")?.tipo, "parceria");
  assert.equal(classifyInteraction("Solicitar orçamento")?.tipo, "orcamento");
  assert.deepEqual(dedupeFields(["nome completo", "nome", "e-mail", "email", "telefone"]), ["nome completo", "e-mail", "telefone"]);
  assert.equal(shortTitle("Agendar consulta | Clínica Vida Plena", "Clínica Vida Plena"), "Agendar consulta");
  const { knowledge } = await clinic();
  const byType = Object.fromEntries(knowledge.interacoes.map((x) => [x.tipo, x]));
  assert.deepEqual(Object.keys(byType).sort(), ["agendamento", "candidatura", "contato"]);
  assert.equal(byType.agendamento.link, "/agendar.html");
  assert.equal(byType.agendamento.titulo, "Agendar consulta");
  assert.match(byType.agendamento.resumo, /escolher dia e horário.*nome completo, telefone, convênio/);
  assert.ok(byType.agendamento.exemplos.includes("book an appointment"), "frases típicas do setor (inglês também)");
  assert.equal(byType.candidatura.link, "/trabalhe-conosco.html");
  // Contato tem intenção própria: a interação vira botão dela e não divide os exemplos.
  assert.ok(knowledge.intencoes.contato.acoes.some((a) => a.href === "/contato.html"));
  const list = mapInteractions({
    projeto: { site: "Loja" },
    paginas: [{ href: "/conta.html", titulo: "Minha conta | Loja", arquivo: "conta.html", acoesSchema: [] }],
    formularios: [{ arquivo: "conta.html", method: "post", botao: "Abrir chamado", campos: ["Assunto", "Descrição", "senha"] }],
    links: [{ href: "/api/account/export", texto: "Baixar meus dados", vezes: 2 }],
  });
  assert.deepEqual(list.map((x) => [x.tipo, x.link, x.requerLogin]), [["suporte", "/conta.html", true]]);
  assert.ok(!list[0].campos.includes("senha"));
});

test("formato da base: setor, conteúdos e interações conferidos e cortados", () => {
  const { knowledge, problems } = checkKnowledge({
    setor: { id: "Saúde", nome: "Saúde", glossario: [{ termo: "Jejum", definicao: "Período sem comer." }, { termo: "", definicao: "x" }], sinonimos: [["consulta", "appointment"], ["só"]] },
    conteudos: [{ titulo: "Check-up", resumo: "Texto.", link: "javascript:alert(1)" }, { titulo: "Sem resumo" }],
    interacoes: [{ tipo: "agendamento", titulo: "Agendar", resumo: "Serve para agendar.", link: "/agendar", exemplos: ["agendar", "marcar"], requerLogin: "sim" }, { tipo: "x", resumo: "sem link" }],
  });
  assert.equal(knowledge.setor.id, "saude");
  assert.equal(knowledge.setor.glossario.length, 1);
  assert.deepEqual(knowledge.setor.sinonimos, [["consulta", "appointment"]]);
  assert.equal(knowledge.conteudos.length, 1);
  assert.equal(knowledge.conteudos[0].link, "", "link perigoso descartado");
  assert.equal(knowledge.interacoes.length, 1);
  assert.equal(knowledge.interacoes[0].requerLogin, false);
  assert.ok(problems.length >= 3);
});

test("agente: glossário (pt e en) só quando o site não responde; resumo + link; interação explicada", async () => {
  const { knowledge } = await clinic();
  const agent = createAgent(knowledge);
  const ask = (t, c) => agent.reply(t, c);
  const carencia = ask("o que é carência?");
  assert.equal(carencia.intencao, "glossario");
  assert.match(carencia.texto, /^Carência: Tempo após a contratação.*\(explicação geral/);
  assert.equal(ask("what is telemedicine?").fonte, "teleconsulta", "inglês pelos sinônimos");
  const checkup = ask("me explica sobre o check-up");
  assert.equal(checkup.intencao, "conteudo");
  assert.match(checkup.texto, /^Resumindo "Check-up anual: por que fazer": /);
  assert.deepEqual(checkup.acoes, [{ rotulo: "Ler o conteúdo completo", href: "/blog/check-up.html" }]);
  const unimed = ask("vocês aceitam unimed?");
  assert.match(unimed.texto, /Aceitamos Unimed/);
  for (const frase of ["quero marcar uma consulta", "book an appointment"]) {
    const r = ask(frase);
    assert.equal(r.fonte, "agendamento", frase);
    assert.match(r.texto, /serve para escolher dia e horário/);
    assert.deepEqual(r.acoes[0], { rotulo: "Ir para Agendar consulta", href: "/agendar.html" });
  }
  assert.equal(ask("tem vaga de emprego?").fonte, "candidatura");
  // No café: a página do próprio site responde "prazo de entrega" antes da definição geral.
  const cafe = createAgent(generateKnowledge(await scanProject(EXAMPLE)).knowledge);
  const prazo = cafe.reply("qual o prazo de entrega?");
  assert.notEqual(prazo.intencao, "glossario");
  assert.match(prazo.texto, /2 dias úteis/);
  const ship = cafe.reply("what is shipping?");
  assert.equal(ship.fonte, "delivery");
  assert.ok(ship.acoes.some((a) => a.href === "/entrega.html"), "aponta para a página do site sobre o assunto");
});

test("interação que pede login traz o botão de entrar", () => {
  const agent = createAgent({
    consultas: { login: "/login.html" },
    interacoes: [{ id: "suporte", tipo: "suporte", titulo: "Meus chamados", resumo: "Serve para registrar um problema.", link: "/conta.html#chamados", requerLogin: true, exemplos: ["quero abrir um chamado", "abrir ticket", "registrar um problema"] }],
    intencoes: { saudacao: { exemplos: ["oi", "olá"], respostas: ["Oi!"] } },
  });
  // 0.10 (M5): primeiro confirma ("Quer que eu te leve até lá?"); com o "sim", os botões.
  const ask = agent.reply("quero abrir um chamado");
  assert.equal(ask.fonte, "suporte");
  assert.match(ask.texto, /precisa entrar na sua conta\. Quer que eu te leve até lá\?/);
  assert.deepEqual(ask.acoes, []);
  assert.deepEqual(ask.sugestoes, ["Sim, vamos", "Agora não"]);
  const r = agent.reply("Sim, vamos", ask.contexto);
  assert.deepEqual(r.acoes.map((a) => a.href), ["/conta.html#chamados", "/login.html"]);
  assert.equal(agent.reply("agora não", ask.contexto).intencao, "confirmacao_nao");
});

test("recuperação em etapas: 'Você quis dizer' com candidatos, depois atendimento humano", async () => {
  const { knowledge } = await clinic();
  const agent = createAgent(knowledge);
  const first = agent.reply("quero ser fornecedor");
  assert.equal(first.intencao, "voce_quis_dizer");
  assert.ok(first.sugestoes.includes("Nenhuma dessas") && first.sugestoes.length >= 2);
  assert.equal(first.contexto.falhas, 1);
  assert.ok(isMiss(first), "conta como falta (aprender e IA opcional)");
  const none = agent.reply("Nenhuma dessas", first.contexto);
  assert.equal(none.intencao, "nenhuma_opcao");
  assert.ok(none.acoes.some((a) => a.href === "/contato.html"));
  const second = agent.reply("asdkj qwe zzz", none.contexto);
  assert.equal(second.intencao, "nao_entendi");
  assert.match(second.texto, /falar com uma pessoa/);
  assert.ok(second.acoes.some((a) => a.href === "/contato.html"));
  // Uma resposta certa zera a contagem.
  assert.equal(agent.reply("oi", second.contexto).contexto.falhas, undefined);
});

test("observação (2ª etapa): formulário usado vira interação e o setor é conferido de novo", async () => {
  const base = generateKnowledge(await scanProject(EXAMPLE)).knowledge;
  const obs = {
    paginas: [{ href: "/orcamento", titulo: "Orçamento para empresas", descricao: "Café para escritórios e eventos corporativos.", termos: "" }],
    formularios: [{ pagina: "/orcamento", titulo: "Pedir orçamento", botao: "Solicitar orçamento", metodo: "post", campos: [{ rotulo: "Empresa", tipo: "text" }, { rotulo: "Quantidade (kg)", tipo: "number" }, { rotulo: "Senha", tipo: "password" }] }],
  };
  const { knowledge, changes } = enrichFromObservation(base, obs);
  const quote = knowledge.interacoes.find((x) => x.tipo === "orcamento");
  assert.equal(quote.link, "/orcamento");
  assert.deepEqual(quote.campos, ["empresa", "quantidade (kg)"]);
  assert.deepEqual(changes.interacoes, ["orcamento (/orcamento)"]);
  assert.equal(knowledge.setor.id, "alimentacao");
  const forced = { ...base, setor: { ...base.setor, id: "juridico", forcado: true } };
  assert.equal(enrichFromObservation(forced, obs).knowledge.setor.id, "juridico", "escolha manual é respeitada");
});

test("raio X: FAQ técnica de documentação (deploy, npm) não vai para o agente", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "ag-07-faq-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "docs"));
  await writeFile(join(dir, "index.html"), "<html><head><title>Loja</title></head><body><h1>Loja</h1></body></html>");
  await writeFile(join(dir, "docs", "FAQ.md"), "# FAQ\n\n## Como faço deploy no Render?\nRode npm run build e publique.\n\n## Vocês entregam no sábado?\nSim, das 8h às 12h.\n");
  const report = await scanProject(dir);
  assert.deepEqual(report.faq.map((f) => f.pergunta), ["Vocês entregam no sábado?"]);
});

test("CLI setor: mostra ranking e troca o setor da base (com backup)", async (t) => {
  const site = await copy(t, CLINIC);
  assert.equal(cli("criar", site, "--json").status, 0);
  const seen = JSON.parse(cli("setor", site, "--json").stdout);
  assert.equal(seen.detectado.setor, "saude");
  const changed = JSON.parse(cli("setor", site, "--setor", "beleza", "--json").stdout);
  assert.equal(changed.aplicado.setor, "beleza");
  const file = JSON.parse(await readFile(join(site, "agente", "conhecimento", "setor.json"), "utf8"));
  assert.equal(file.id, "beleza");
  assert.equal(JSON.parse(await readFile(join(site, "agente-gerador", "config.json"), "utf8")).setor, "beleza");
  // Nota de cobertura muda com o setor: clínica não é cobrada por frete nem trocas.
  const avaliacao = JSON.parse(cli("avaliar", site, "--json").stdout);
  assert.ok(!avaliacao.cobertura.falta.some((f) => f.id === "entrega"));
  const bad = cli("setor", site, "--setor", "astronomia");
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr + bad.stdout, /Setor desconhecido/);
});
