// Versão 0.10: conversa guiada e proatividade. M1 pergunta "De qual?" e lembra a resposta, M2
// mensagem proativa por página, M3 fora do escopo do setor, M4 BM25, M5 confirmação antes do
// login, M6 captura de contato que preenche o formulário do site, M7 "explica melhor", M8 vídeos e
// PDFs como cartões, M9 perfil com listas (várias unidades/pedidos).
import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { ROOT, exampleCopy } from "./helpers.js";
import { scanProject } from "../src/scanner/index.js";
import { videosOf, filesOf, videoFrom } from "../src/scanner/html.js";
import { generateKnowledge } from "../src/generator/index.js";
import { createAgent, pickLabel } from "../src/agent/agent.js";
import { checkKnowledge } from "../src/agent/knowledge.js";
import { createIndex } from "../src/agent/search.js";
import { outOfScope } from "../src/domain/index.js";
import { summarize } from "../src/domain/contents.js";

const FIX = join(ROOT, "tests", "fixtures", "construtora");
let cached;
const obra = async () => (cached ||= generateKnowledge(await scanProject(FIX)).knowledge);
const LOJA = join(ROOT, "examples", "loja-exemplo");
let cachedLoja;
const loja = async () => (cachedLoja ||= generateKnowledge(await scanProject(LOJA)).knowledge);
// Conversa: cada frase recebe o contexto da resposta anterior (como o widget faz).
const talk = (agent, frases, opcoes) => {
  let ctx = {};
  return frases.map((f) => {
    const r = agent.reply(f, ctx, opcoes);
    ctx = r.contexto;
    return r;
  });
};

test("M1: a mesma etapa em dois lugares → 'De qual?'; a resposta vale para as próximas perguntas", async () => {
  const a = createAgent(await obra());
  const [ask, pick, again, other] = talk(a, ["fotos da área de lazer", "o do Parque Verde", "e a área de lazer de novo?", "fotos da fundação"]);
  assert.equal(ask.intencao, "galeria_escolher");
  assert.match(ask.texto, /Áreas de lazer em 2 lugares: Parque Verde ou Residencial Sol/);
  assert.deepEqual(ask.sugestoes, ["Parque Verde", "Residencial Sol"]);
  assert.equal(pick.intencao, "galeria");
  assert.equal(pick.imagens[0].src, "/empreendimentos/img/verde-lazer-2.jpg");
  assert.equal(pick.contexto.grupo, "Parque Verde");
  assert.equal(again.imagens[0].src, "/empreendimentos/img/verde-lazer-2.jpg", "lembrou o lugar sem perguntar de novo");
  assert.equal(other.fonte, "parque-verde-fundacao");
  // Pela posição e por "Fotos de ..." (os botões da pergunta genérica).
  assert.equal(talk(a, ["fotos da área de lazer", "a segunda"])[1].imagens[0].src, "/empreendimentos/img/sol-lazer-b.jpg");
  const [vaga, sol] = talk(a, ["tem fotos da obra?", "Fotos de Residencial Sol"]);
  assert.equal(vaga.contexto.esclarecer.campo, "grupo");
  assert.equal(sol.imagens[0].src, "/empreendimentos/img/sol-lazer-b.jpg");
  // Mudou de assunto em vez de responder: segue normal e esquece a pergunta.
  const [, off] = talk(a, ["fotos da área de lazer", "qual o horário de atendimento?"]);
  assert.equal(off.intencao, "faq");
  assert.equal(off.contexto.esclarecer, undefined);
});

test("pickLabel: texto, parte, posição e 'todas'", () => {
  const o = ["Residencial Sol", "Parque Verde"];
  assert.equal(pickLabel(o, "parque verde"), 1);
  assert.equal(pickLabel(o, "o do sol"), 0);
  assert.equal(pickLabel(o, "a primeira"), 0);
  assert.equal(pickLabel(o, "2"), 1);
  assert.equal(pickLabel(o, "todas", { todas: true }), -2);
  assert.equal(pickLabel(o, "todas"), -1);
  assert.equal(pickLabel(o, "qual o horário?"), -1);
});

test("M2: mensagem proativa por página (fotos e formulários), desligável", async () => {
  const k = await obra();
  assert.deepEqual(k.agente.proativas.map((p) => [p.tipo, p.pagina]), [
    ["fotos", "/empreendimentos/parque-verde.html"],
    ["fotos", "/empreendimentos/residencial-sol.html"],
  ]);
  const a = createAgent(k);
  assert.deepEqual(a.proativa("/empreendimentos/residencial-sol"), { texto: "Quer ver as fotos mais recentes de Residencial Sol?", sugestoes: ["Fotos de Residencial Sol"], aposSeg: 20 });
  assert.equal(a.proativa("/contato.html"), null);
  assert.equal(createAgent({ ...k, agente: { ...k.agente, proativa: false } }).proativa("/empreendimentos/residencial-sol.html"), null);
  assert.equal(createAgent({ ...k, agente: { ...k.agente, recursos: { fotos: false } } }).proativa("/empreendimentos/residencial-sol.html"), null, "fotos desligadas: sem convite de fotos");
  // A sugestão da proativa é respondida pelo próprio agente.
  assert.equal(a.reply("Fotos de Residencial Sol").intencao, "galeria");
});

test("M3: fora do escopo do setor só quando a frase pede a coisa e a base não tem nada", async () => {
  const k = await obra();
  assert.ok(k.setor.fora.some((f) => f.id === "veiculos" && f.termos.includes("carro")));
  assert.ok(!k.setor.fora.some((f) => f.termos.includes("apartamento")), "o que aparece no site nunca é 'fora'");
  const a = createAgent(k);
  for (const frase of ["vocês vendem carro?", "vocês fazem pizza?", "tem consulta com dentista?"]) {
    const r = a.reply(frase);
    assert.equal(r.intencao, "fora_do_escopo", frase);
    assert.match(r.texto, /não é algo que Construtora Horizonte oferece: aqui o assunto é arquitetura, engenharia e construção/);
  }
  assert.notEqual(a.reply("tem estacionamento para carro?").intencao, "fora_do_escopo", "carro sem pedido de compra não é recusado");
  const cafe = createAgent(await loja());
  assert.equal(cafe.reply("vocês vendem carro?").intencao, "fora_do_escopo");
  assert.equal(cafe.reply("quero um café").intencao, "catalogo");
  assert.deepEqual(outOfScope(["construcao"], "obra e reforma"), outOfScope(["construcao"], "obra e reforma"));
  assert.ok(!outOfScope(["saude"], "vendemos pneus e rodas").some((f) => f.termos.includes("pneu")));
});

test("M4: BM25 ordena pelo foco quando a cobertura empata (texto longo não ganha por tamanho)", () => {
  const longo = "frete ".concat("informações gerais sobre a loja e outros assuntos variados ".repeat(30));
  const idx = createIndex([
    { id: "longo", tipo: "faq", principal: "Entrega", secundario: longo },
    { id: "curto", tipo: "faq", principal: "Entrega", secundario: "frete grátis acima de 200 reais" },
  ]);
  const hits = idx.search("frete da entrega");
  assert.deepEqual(hits.map((h) => h.doc.id), ["curto", "longo"]);
  assert.ok(hits[0].bm25 > hits[1].bm25);
  assert.equal(hits[0].ratio, hits[1].ratio, "a cobertura (que decide se responde) não muda");
  assert.equal(idx.knows("frete"), true);
  assert.equal(idx.knows("carro"), false);
});

test("M5: contato não é área logada; área logada pede confirmação antes de levar", async () => {
  const k = await obra();
  assert.equal(k.interacoes.find((x) => x.tipo === "contato").requerLogin, false, "/contato.html não é /conta");
});

const ORC = {
  agente: { site: "Marcenaria Pinho" },
  intencoes: { saudacao: { exemplos: ["oi", "olá"], respostas: ["Oi!"] }, contato: { exemplos: ["falar com vocês", "contato"], respostas: ["Fale pelo WhatsApp."], acoes: [{ rotulo: "WhatsApp", href: "https://wa.me/5511988887777" }] } },
  interacoes: [
    { id: "orcamento", tipo: "orcamento", titulo: "Peça seu orçamento", resumo: "Serve para pedir um preço sob medida.", campos: ["nome", "e-mail", "telefone", "mensagem"], link: "/orcamento.html", exemplos: ["quero um orçamento", "pedir orçamento", "quanto custa um armário sob medida"] },
  ],
};

test("M6: captura de contato conversacional → formulário do site preenchido (sem enviar)", () => {
  const a = createAgent(ORC);
  const [offer, askName, name, badMail, mail, msg] = talk(a, ["quero um orçamento", "Preencher comigo", "meu nome é Ana Souza", "ana@", "ana@exemplo.com.br", "Armário de cozinha de 3 metros"]);
  assert.match(askName.texto, /Qual é o seu nome\?/);
  assert.deepEqual(offer.sugestoes, ["Preencher comigo"]);
  assert.match(offer.texto, /deixo o formulário preenchido para você conferir e enviar/);
  assert.match(name.texto, /Obrigado, Ana! Qual e-mail ou telefone/);
  assert.equal(badMail.intencao, "lead_contato");
  assert.match(badMail.texto, /Não parece um e-mail/);
  assert.match(mail.texto, /Quer deixar uma mensagem/);
  assert.equal(msg.intencao, "lead_pronto");
  assert.deepEqual(msg.formulario, { pagina: "/orcamento.html", valores: { nome: "Ana Souza", email: "ana@exemplo.com.br", mensagem: "Armário de cozinha de 3 metros" } });
  assert.match(msg.texto, /eu não envio nada sozinho/);
  assert.deepEqual(msg.acoes, [{ rotulo: "Abrir o formulário preenchido", href: "/orcamento.html" }]);
  assert.equal(msg.contexto.lead, undefined, "os dados não ficam no contexto depois");
  // Telefone formatado; "pular" a mensagem; cancelar no meio; pergunta no meio segue normal.
  const tel = talk(a, ["me liguem", "João", "(11) 98888-7777", "pular"]);
  assert.equal(tel[0].intencao, "lead_inicio");
  assert.deepEqual(tel[3].formulario.valores, { nome: "João", telefone: "(11) 98888-7777" });
  assert.equal(talk(a, ["me liguem", "cancelar"])[1].intencao, "lead_cancelado");
  assert.notEqual(a.reply("o que é retorno?").intencao, "lead_inicio", "definição não abre a captura");
  assert.notEqual(talk(a, ["me liguem", "qual o horário de vocês?"])[1].intencao, "lead_contato");
  // Desligado no instalador: sem oferta e sem captura.
  const off = createAgent({ ...ORC, agente: { ...ORC.agente, recursos: { preencher: false } } });
  assert.equal(off.reply("quero um orçamento").sugestoes.includes("Preencher comigo"), false);
  assert.notEqual(off.reply("me liguem").intencao, "lead_inicio");
});

test("M7: resposta curta primeiro; 'explica melhor' mostra o resumo maior", () => {
  const texto = "A marcenaria usa MDF com acabamento em laca. O prazo de produção é de 30 dias úteis após a aprovação do projeto. A instalação é feita pela nossa equipe, sem custo extra na Grande São Paulo. Os móveis têm garantia de 5 anos contra defeitos de fabricação. Ferragens são da linha premium, com amortecimento. O projeto 3D é enviado antes da produção para aprovação.";
  const resumo = summarize(texto, { titulo: "Como trabalhamos" });
  const detalhe = summarize(texto, { frases: 5, max: 900, titulo: "Como trabalhamos" });
  assert.ok(detalhe.length > resumo.length + 60);
  const a = createAgent({ ...ORC, conteudos: [{ id: "como-trabalhamos", titulo: "Como trabalhamos", resumo, detalhe, topicos: "marcenaria mdf laca prazo instalacao garantia", link: "/sobre.html#como" }] });
  const [short, long] = talk(a, ["me fala sobre como trabalhamos", "explica melhor"]);
  assert.equal(short.intencao, "conteudo");
  assert.deepEqual(short.sugestoes, ["Explicar melhor"]);
  assert.equal(long.intencao, "detalhe");
  assert.ok(long.texto.includes(detalhe));
  assert.equal(long.acoes[0].href, "/sobre.html#como");
  // Sem resposta anterior, "explica melhor" não inventa.
  assert.notEqual(a.reply("explica melhor").intencao, "detalhe");
});

test("M8: vídeos (YouTube/Vimeo/arquivo) e PDFs viram cartões; endereços estranhos são recusados", async () => {
  assert.deepEqual(videoFrom("https://youtu.be/dQw4w9WgXcQ"), { plataforma: "youtube", vid: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
  assert.equal(videoFrom("https://evil.example/v"), null);
  assert.equal(videosOf('<a href="https://vimeo.com/123456789">Drone</a>')[0].url, "https://vimeo.com/123456789");
  assert.equal(filesOf('<a href="/cardapio.pdf">Baixar o cardápio</a>')[0].texto, "cardápio");
  const k = await obra();
  assert.equal(k.midias.videos[0].url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(k.midias.arquivos[0].href, "/empreendimentos/docs/memorial-descritivo-sol.pdf");
  const a = createAgent(k);
  const v = a.reply("tem vídeo do decorado?");
  assert.equal(v.intencao, "cartoes");
  assert.deepEqual(v.cartoes, [{ tipo: "video", titulo: "Tour pelo decorado do Residencial Sol", href: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", plataforma: "youtube", pagina: "/empreendimentos/residencial-sol.html#videos" }]);
  const pdf = a.reply("quero o memorial descritivo");
  assert.equal(pdf.cartoes[0].tipo, "pdf");
  assert.equal(pdf.cartoes[0].href, "/empreendimentos/docs/memorial-descritivo-sol.pdf");
  assert.equal(createAgent({ ...k, agente: { ...k.agente, recursos: { fotos: false } } }).reply("tem vídeo do decorado?").cartoes, undefined);
  // Pedido de definição fica com o glossário; "link para download" não vira lista de PDFs.
  assert.equal(a.reply("o que é memorial descritivo?").intencao, "glossario");
  assert.equal(a.reply("link para download").cartoes, undefined);
  assert.equal(a.reply("tem pdf?").cartoes[0].tipo, "pdf");
  const { problems } = checkKnowledge({ midias: { videos: [{ titulo: "x", url: "javascript:alert(1)" }], arquivos: [{ titulo: "y", href: "/a.exe" }] } });
  assert.ok(problems.some((p) => /midias\.videos/.test(p)) && problems.some((p) => /midias\.arquivos/.test(p)));
});

test("M9: perfil com várias unidades → 'De qual?', resposta por item, 'todas' e item citado na frase", async () => {
  const k = await obra();
  const a = createAgent({ ...k, perfil: { ...k.perfil, ativo: true } });
  const CARLOS = {
    nome: "Carlos Lima",
    unidades: [
      { empreendimento: "Residencial Sol", apartamento: "1203", obra: { etapa: "Áreas de lazer", percentual: 78, previsaoEntrega: "2027-03-30" } },
      { empreendimento: "Parque Verde", apartamento: "504", obra: { etapa: "Fundação", percentual: 20, previsaoEntrega: "2028-01-15" } },
    ],
  };
  const u = { usuario: CARLOS };
  const [ask, one, next] = talk(a, ["como está a obra do meu apartamento?", "a do Parque Verde", "e a previsão de entrega do meu apartamento?"], u);
  assert.equal(ask.intencao, "perfil__andamento_obra");
  assert.match(ask.texto, /Você tem 2 unidades: 1203 – Residencial Sol ou 504 – Parque Verde/);
  assert.deepEqual(ask.sugestoes, ["1203 – Residencial Sol", "504 – Parque Verde", "Todas"]);
  assert.match(one.texto, /Carlos, a unidade 504 do Parque Verde está na etapa Fundação, com 20% concluído/);
  assert.equal(one.imagens[0].src, "/empreendimentos/img/verde-fundacao.jpg", "foto da etapa no empreendimento da unidade");
  assert.match(next.texto, /unidade 504 \(Parque Verde\) é 15\/01\/2028/, "lembrou a unidade");
  const [, all] = talk(a, ["como está a obra do meu apartamento?", "todas"], u);
  assert.match(all.texto, /1203 – Residencial Sol: .*78%.* 504 – Parque Verde: .*20%/);
  assert.match(a.reply("como está a obra do meu apartamento 1203?", {}, u).texto, /unidade 1203 do Residencial Sol/);
  // Uma unidade só continua como na 0.8 (sem pergunta).
  assert.match(a.reply("como está a obra do meu apartamento?", {}, { usuario: { nome: "Ana", unidade: CARLOS.unidades[0] } }).texto, /Ana, a unidade 1203/);
  // Modo servidor: a escolha vai no perfil e o widget completa com os dados locais.
  const srv = talk(a, ["como está a obra do meu apartamento?", "504 – Parque Verde"]);
  assert.equal(srv[0].precisaLogin, undefined);
  assert.match(a.perfil("andamento_obra", CARLOS, { item: 1 }).texto, /unidade 504/);
});

test("widget instalado: casa os campos do formulário e reconhece a mesma página", async (t) => {
  const site = await exampleCopy(t);
  const r = spawnSync(process.execPath, [join(ROOT, "bin", "agent-generator.js"), "instalar", site, "--sim"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const w = await import(pathToFileURL(join(site, "agente", "widget.js")).href);
  const map = w.matchFields(
    [
      { tag: "input", tipo: "text", texto: "seu nome" },
      { tag: "input", tipo: "email", texto: "contato" },
      { tag: "input", tipo: "tel", texto: "whatsapp" },
      { tag: "textarea", tipo: "", texto: "como podemos ajudar" },
    ],
    { nome: "Ana", email: "a@b.co", telefone: "(11) 98888-7777", mensagem: "Oi" },
  );
  assert.deepEqual(map, { 0: "nome", 1: "email", 2: "telefone", 3: "mensagem" });
  assert.deepEqual(w.matchFields([{ tag: "input", tipo: "text", texto: "nome da empresa" }], { nome: "Ana" }), {});
  assert.equal(w.samePage("/orcamento.html", "/orcamento"), true);
  assert.equal(w.samePage("index.html", "/"), true);
  assert.equal(w.samePage("/a.html", "/b.html"), false);
});
