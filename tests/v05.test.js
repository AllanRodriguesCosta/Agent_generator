// Versão 0.5: raio X de frameworks (sitemap, traduções, metadata do Next, mensagens de erro),
// frases de teste geradas, relatório HTML com cobertura e consultas com login por token.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT, exampleCopy } from "./helpers.js";
import { scanProject } from "../src/scanner/index.js";
import { pagesFromSitemap, readLocale, nextMetadata, errorMessages, titleFromPath } from "../src/scanner/extras.js";
import { variationsOf, typo } from "../src/eval/variations.js";
import { coverage } from "../src/eval/coverage.js";
import { evaluateKnowledge, evaluationText } from "../src/eval/index.js";
import { evaluationHtml } from "../src/eval/html.js";
import { train, classify } from "../src/agent/classifier.js";
import { readToken, lookupHeaders } from "../src/agent/lookup.js";
import { checkKnowledge } from "../src/agent/knowledge.js";
import { createAgent } from "../src/agent/agent.js";
import { summarize, applyObservation } from "../src/observe/learn.js";
import { exchange } from "../src/observe/record.js";

const cli = (...args) => spawnSync(process.execPath, [join(ROOT, "bin", "agent-generator.js"), ...args], { encoding: "utf8" });

test("extras do raio X: sitemap, tradução com FAQ, metadata do Next e mensagens de erro", () => {
  assert.deepEqual(pagesFromSitemap("<urlset><url><loc>https://a.com/</loc></url><url><loc> https://a.com/sobre-nos </loc></url><url><loc>https://a.com/img.png</loc></url></urlset>"), ["/", "/sobre-nos"]);
  assert.equal(titleFromPath("/politica-de-privacidade"), "Politica de privacidade");
  const loc = readLocale(JSON.stringify({ faq: [{ question: "Entregam no Nordeste?", answer: "Sim, para todo o Brasil." }], cta: "Fale com a gente", url: "https://x.com" }));
  assert.deepEqual(loc.faq, [{ pergunta: "Entregam no Nordeste?", resposta: "Sim, para todo o Brasil." }]);
  assert.ok(loc.textos.includes("Fale com a gente") && !loc.textos.some((t) => /^https/.test(t)));
  assert.deepEqual(nextMetadata('export const metadata = {\n  title: "Loja Next",\n  description: "Feita com Next."\n};'), { titulo: "Loja Next", descricao: "Feita com Next." });
  assert.equal(nextMetadata("export default function A() {}"), null);
  const errs = errorMessages(`res.status(400).json({ message: "Informe um CEP válido." }); throw new Error("Estoque insuficiente para este item."); throw new Error(\`x \${y}\`); throw new Error("ECONNREFUSED"); raise ValueError("Senha precisa de 8 letras")`);
  assert.deepEqual(errs, ["Estoque insuficiente para este item.", "Informe um CEP válido.", "Senha precisa de 8 letras"]);
});

test("raio X de um projeto Next.js com sitemap, locales e API", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "ag-fw-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "app", "sobre"), { recursive: true });
  await mkdir(join(dir, "locales"), { recursive: true });
  await mkdir(join(dir, "public"), { recursive: true });
  await writeFile(join(dir, "package.json"), JSON.stringify({ name: "fw", dependencies: { next: "14", react: "18" } }));
  await writeFile(join(dir, "app", "page.tsx"), 'export const metadata = { title: "Loja Next", description: "Uma loja feita com Next." };\nexport default function P() { return <main><p>Produtos artesanais.</p></main>; }');
  await writeFile(join(dir, "app", "sobre", "page.tsx"), 'export const metadata = { title: "Sobre nós" };\nexport default function S() { return <p>Somos pequenos.</p>; }');
  await writeFile(join(dir, "locales", "pt-BR.json"), JSON.stringify({ faq: [{ question: "Vocês entregam no Nordeste?", answer: "Sim, em todo o Brasil." }] }));
  await writeFile(join(dir, "public", "sitemap.xml"), "<urlset><url><loc>https://l.test/politica-de-privacidade</loc></url></urlset>");
  await writeFile(join(dir, "api.js"), 'app.post("/api/pedidos", (req, res) => res.status(400).json({ message: "Informe um CEP válido para o frete." }));');
  const r = await scanProject(dir);
  assert.deepEqual(r.paginas.map((p) => p.titulo).sort(), ["Loja Next", "Politica de privacidade", "Sobre nós"]);
  assert.equal(r.faq[0].pergunta, "Vocês entregam no Nordeste?");
  assert.deepEqual(r.traducoes, ["pt-BR"]);
  assert.deepEqual(r.mensagensErro, ["Informe um CEP válido para o frete."]);
  assert.ok(r.projeto.stack.includes("Next.js"));
});

test("variações geradas e erro de digitação no classificador", () => {
  assert.deepEqual(variationsOf("Você é humano?"), ["voce e humano", "vc é humano?"]);
  assert.equal(typo("qual o horário de entrega"), "qual o hoárrio de entrega");
  assert.deepEqual(variationsOf("oi"), [], "frase de uma palavra não gera variação");
  const m = train({ ajuda: ["me ajuda", "preciso de ajuda"], tchau: ["tchau", "até mais"] });
  assert.equal(classify(m, "me aujda")[0].intent, "ajuda", "letras trocadas de lugar contam como um erro");
});

test("avaliação: variações (indicativas), cobertura e relatório HTML sem script", () => {
  const base = { agente: { site: "Café <Bom>" }, faq: [{ pergunta: "Qual o horário de atendimento?", resposta: "Das 9h às 18h." }, { pergunta: "Vocês aceitam pix?", resposta: "Sim, pix e cartão." }], intencoes: { saudacao: { exemplos: ["oi tudo bem", "olá, bom dia"], respostas: ["Oi!"] }, contato: { exemplos: ["quero falar com vocês", "qual o whatsapp"], respostas: ["WhatsApp (11) 9999-9999."] } } };
  const r = evaluateKnowledge(base, { variacoes: true });
  assert.ok(r.variacoes.total >= 6);
  assert.equal(typeof r.porcentagens.variacoes, "number");
  const semVariacoes = evaluateKnowledge(base);
  assert.equal(r.geral, semVariacoes.geral, "variações não mudam o acerto geral");
  assert.ok(r.cobertura.tem.some((x) => x.id === "horario") && r.cobertura.falta.some((x) => x.id === "troca"));
  assert.match(evaluationText(r), /Falta na base: .*trocas/);
  const html = evaluationHtml(r, { site: base.agente.site });
  assert.match(html, /Café &lt;Bom&gt;/);
  assert.doesNotMatch(html, /<script/i);
  assert.deepEqual(coverage({ faq: [], intencoes: {}, paginas: [] }).tem, []);
});

test("CLI avaliar --variacoes --html grava o relatório", async (t) => {
  const site = await exampleCopy(t);
  assert.equal(cli("criar", site).status, 0);
  const r = cli("avaliar", site, "--variacoes", "--html", "--json");
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(out.variacoes.total > 10);
  assert.ok(Array.isArray(out.cobertura.falta));
  assert.match(await readFile(join(site, "agente-gerador", "avaliacao.html"), "utf8"), /Acerto geral/);
});

test("login por token: base valida, agente repassa e o widget lê a chave certa", () => {
  const raw = { intencoes: { saudacao: { exemplos: ["oi", "olá"], respostas: ["Oi!"] } }, consultas: { dados: [{ id: "pedidos", rotulo: "pedidos", url: "/api/orders", exemplos: ["meus pedidos", "status do pedido"] }], auth: { tipo: "bearer", onde: "localStorage", chave: "auth", campo: "accessToken" } } };
  const { knowledge } = checkKnowledge(raw);
  assert.deepEqual(knowledge.consultas.auth, { tipo: "bearer", onde: "localStorage", chave: "auth", campo: "accessToken" });
  assert.match(checkKnowledge({ consultas: { auth: { tipo: "bearer", chave: "a b" } } }).problems.join(" "), /consultas\.auth/);
  const r = createAgent(raw).reply("status do pedido");
  assert.deepEqual(r.consulta.auth, knowledge.consultas.auth);
  const jwt = "aaaaaaaaaa.bbbbbbbbbb.cccccccccc";
  const storage = { localStorage: { getItem: (k) => (k === "auth" ? JSON.stringify({ accessToken: jwt }) : k === "plain" ? jwt : k === "quoted" ? JSON.stringify(jwt) : null) } };
  assert.equal(readToken({ tipo: "bearer", onde: "localStorage", chave: "auth", campo: "accessToken" }, storage), jwt);
  assert.equal(readToken({ tipo: "bearer", chave: "plain" }, storage), jwt);
  assert.equal(readToken({ tipo: "bearer", chave: "quoted" }, storage), jwt);
  assert.equal(readToken({ tipo: "bearer", chave: "nada" }, storage), null);
  assert.deepEqual(lookupHeaders({ tipo: "bearer", chave: "plain" }, storage), { accept: "application/json", authorization: `Bearer ${jwt}` });
  assert.deepEqual(lookupHeaders(undefined, storage), { accept: "application/json" }, "padrão: cookie do próprio site");
});

test("observação aprende o login por token: só o nome da chave, nunca o valor", async () => {
  const x = exchange({ method: "GET", url: "/api/orders", status: 200, type: "application/json", responseBody: Buffer.from(JSON.stringify({ data: [{ id: "a1", status: "Enviado" }] })), withSession: true, auth: "bearer" });
  assert.equal(x.autenticacao, "bearer");
  const obs = summarize({ events: [{ tipo: "armazenamento", chaves: [{ onde: "localStorage", chave: "auth", campo: "accessToken" }, { onde: "x", chave: "ruim" }] }], exchanges: [x] });
  assert.deepEqual(obs.tokens, [{ onde: "localStorage", chave: "auth", campo: "accessToken" }]);
  const { knowledge, changes } = applyObservation({ agente: { site: "L" }, intencoes: {}, faq: [], paginas: [], catalogo: { itens: [] } }, obs);
  assert.deepEqual(knowledge.consultas.auth, { tipo: "bearer", onde: "localStorage", chave: "auth", campo: "accessToken" });
  assert.match(changes.auth, /localStorage\["auth"\]\.accessToken/);
  const recorder = await readFile(join(ROOT, "src", "observe", "client", "gravador.js"), "utf8");
  assert.match(recorder, /tipo: "armazenamento"/);
  assert.doesNotMatch(recorder, /valor:\s*v/, "o valor do token não é enviado");
});
