import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scanProject } from "../src/scanner/index.js";
import { generateKnowledge } from "../src/generator/index.js";
import { buildPrompt, parseAiAnswer, mergeAi, askGemini } from "../src/generator/ai.js";
import { install, detectTarget, injectTags, MARKER, CORE_FILES } from "../src/installer/index.js";
import { createAgent } from "../src/agent/agent.js";
import { EXAMPLE, exampleCopy } from "./helpers.js";

const report = await scanProject(EXAMPLE);
const { knowledge } = generateKnowledge(report);

test("prompt para IA de chat: regras contra invenção, formato e relatório", () => {
  const p = buildPrompt(report, knowledge);
  assert.match(p, /NUNCA invente preço/);
  assert.match(p, /"intencoes"/);
  assert.match(p, /Café Aurora/);
  assert.match(p, /\/cardapio\.html/);
  assert.ok(p.length < 40000);
});

test("resposta da IA: JSON dentro de bloco, junta só o que é válido e confere links", () => {
  const answer = `Claro! Aqui está:\n\`\`\`json\n${JSON.stringify({
    intencoes: {
      saudacao: { exemplos: ["eae", "oi", "salve salve"] },
      assinatura_cancelar: { exemplos: ["cancelar assinatura", "quero parar a assinatura", "como cancelo o plano", "sair da assinatura", "encerrar assinatura", "não quero mais receber café"], respostas: ["Você cancela quando quiser, sem multa."], acoes: [{ rotulo: "Assinatura", href: "/assinatura.html" }, { rotulo: "Mal", href: "/nao-existe" }] },
      fraca: { exemplos: ["a", "b"], respostas: ["x"] },
    },
    faq: [{ pergunta: "Tem café descafeinado?", resposta: "<b>Não</b> temos no momento.", link: "javascript:alert(1)" }, { pergunta: "O café vem moído?", resposta: "duplicada" }],
    paginas: { cardapio: "menu, lista de cafés", "nao-existe": "x" },
  })}\n\`\`\``;
  const { knowledge: merged, changes } = mergeAi(knowledge, parseAiAnswer(answer));
  assert.equal(changes.exemplos, 2, "'oi' já existia");
  assert.deepEqual(changes.intencoesNovas, ["assinatura_cancelar"]);
  assert.deepEqual(merged.intencoes.assinatura_cancelar.acoes, [{ rotulo: "Assinatura", href: "/assinatura.html" }]);
  assert.equal(changes.faqNovas, 1);
  const added = merged.faq.find((f) => f.pergunta === "Tem café descafeinado?");
  assert.equal(added.resposta, "Não temos no momento.");
  assert.equal(added.link, "");
  assert.equal(added.origem, "ia");
  assert.equal(changes.paginas, 1);
  assert.match(merged.paginas.find((p) => p.id === "cardapio").termos, /menu/);
  assert.equal(changes.ignorados.length, 1);
  assert.equal(createAgent(merged).reply("quero parar a assinatura").intencao, "assinatura_cancelar");
  assert.throws(() => parseAiAnswer("não sei"), /JSON válido/);
});

test("Gemini: chamada com a chave no cabeçalho e erro claro sem chave", async () => {
  await assert.rejects(askGemini("x", {}), /GEMINI_API_KEY/);
  let seen;
  const text = await askGemini("prompt", {
    apiKey: "chave-teste",
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"faq":[]}' }] } }] }) };
    },
  });
  assert.equal(text, '{"faq":[]}');
  assert.match(seen.url, /generativelanguage\.googleapis\.com/);
  assert.equal(seen.init.headers["x-goog-api-key"], "chave-teste");
  assert.ok(!seen.url.includes("chave-teste"), "a chave não vai na URL");
  await assert.rejects(askGemini("x", { apiKey: "k", fetchImpl: async () => ({ ok: false, status: 429 }) }), /429/);
});

test("instalação: pasta pública detectada, núcleo + widget copiados, base preservada e tags inseridas uma vez", async (t) => {
  const site = await exampleCopy(t);
  const target = await detectTarget(site, []);
  assert.equal(target.dir, join(site, "agente"));
  const first = await install(site, knowledge, { target });
  assert.deepEqual((await readdir(join(site, "agente", "nucleo"))).sort(), [...CORE_FILES].sort());
  for (const f of ["widget.js", "widget.css", "servidor.js", "LEIA-ME.md"]) assert.ok((await readdir(join(site, "agente"))).includes(f), f);
  assert.equal(first.written.length, 5);
  const faqFile = join(site, "agente", "conhecimento", "faq.json");
  await writeFile(faqFile, "[]\n");
  const second = await install(site, knowledge, { target });
  assert.equal(second.kept.length, 5);
  assert.equal(await readFile(faqFile, "utf8"), "[]\n", "edição manual preservada");
  const a = await injectTags(site, "/agente/");
  assert.equal(a.changed.length, 5);
  const b = await injectTags(site, "/agente/");
  assert.equal(b.changed.length, 0);
  const html = await readFile(join(site, "index.html"), "utf8");
  assert.equal(html.split(MARKER).length, 2);
  assert.match(html, /<script type="module" src="\/agente\/widget\.js"><\/script>\n<\/body>/);
});

test("instalação: Vite/React/Next usam public/agente; SvelteKit static/; Angular src/assets", async (t) => {
  const { mkdir } = await import("node:fs/promises");
  const site = await exampleCopy(t);
  await mkdir(join(site, "public"));
  assert.equal((await detectTarget(site, ["React", "Vite"])).dir, join(site, "public", "agente"));
  await mkdir(join(site, "static"));
  assert.equal((await detectTarget(site, ["SvelteKit"])).dir, join(site, "static", "agente"));
});
