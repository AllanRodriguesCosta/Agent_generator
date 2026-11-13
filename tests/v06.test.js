// Versão 0.6: site publicado (crawler) -> serviço do agente, e IA que só reescreve o pedido.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, access, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { ROOT } from "./helpers.js";
import { parseRobots, productsFromJsonLd, productsFromApi, mirrorFile, PRIVATE_PATH, crawlSite, cspAdvice } from "../src/crawler/index.js";
import { buildFromSite } from "../src/site/index.js";
import { iaConfig, interpret, withIa, cleanPhrase, instructions } from "../src/agent/ia.js";
import { createAgent } from "../src/agent/agent.js";
import { CORE_FILES } from "../src/installer/index.js";

const page = (title, body) => `<!doctype html><html lang="pt-BR"><head><title>${title}</title><meta name="description" content="${title} na Loja Teste"></head><body>${body}</body></html>`;
const product = (id, name, price) =>
  `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name, sku: id, brand: { "@type": "Brand", name: "Marca" }, category: "Guitarras", offers: { "@type": "Offer", price, priceCurrency: "BRL" } })}</script>`;

async function fakeStore(t) {
  const requests = [];
  const routes = {
    "/robots.txt": ["text/plain", "User-agent: *\nDisallow: /privado\n"],
    "/sitemap.xml": ["application/xml", "<urlset><url><loc>/sobre</loc></url><url><loc>/privado/segredo</loc></url></urlset>"],
    "/": ["text/html", page("Loja Teste | Instrumentos", `<h1>Loja Teste</h1><nav><a href="/sobre">Sobre nós</a> <a href="/faq">Perguntas frequentes</a> <a href="/contato">Contato</a> <a href="/minha-conta">Minha conta</a> <a href="/carrinho">Carrinho</a> <a href="/produto?id=g1">Guitarra Azul</a> <a href="/produto?id=g2">Guitarra Preta</a> <a href="https://outro.site/x">Fora</a></nav><p>Instrumentos musicais com entrega para todo o Brasil e atendimento de verdade.</p>`)],
    "/sobre": ["text/html", page("Sobre nós", "<h1>Sobre nós</h1><p>Somos uma loja de instrumentos musicais fundada em 2010, em Curitiba.</p>")],
    "/faq": ["text/html", page("Perguntas frequentes", '<h1>Perguntas frequentes</h1><details id="prazo"><summary>Qual o prazo de entrega?</summary><p>Entregamos em até 7 dias úteis para todo o Brasil.</p></details><details><summary>Como faço uma troca?</summary><p>Você tem 7 dias para pedir a troca pelo e-mail da loja.</p></details>')],
    "/contato": ["text/html", page("Contato", "<h1>Contato</h1><p>Fale com a gente pelo e-mail contato@lojateste.com.br ou pelo WhatsApp (41) 99999-0000.</p>")],
    "/produto?id=g1": ["text/html", page("Guitarra Azul", `<h1>Guitarra Azul</h1>${product("g1", "Guitarra Azul", "1500.00")}`)],
    "/produto?id=g2": ["text/html", page("Guitarra Preta", `<h1>Guitarra Preta</h1>${product("g2", "Guitarra Preta", 2100)}`)],
    "/api/products": ["application/json", JSON.stringify({ data: [{ id: "g1", name: "Guitarra Azul", brand: "Marca", category: "Guitarras", price: 1500 }, { id: "g2", name: "Guitarra Preta", brand: "Marca", category: "Guitarras", price: 2100 }, { id: "a1", name: "Amplificador 20W", brand: "Marca", category: "Amplificadores", price: 800 }] })],
  };
  const server = createServer((req, res) => {
    requests.push(req.url);
    const r = routes[req.url];
    if (!r) {
      res.statusCode = 404;
      return res.end("nada");
    }
    res.setHeader("content-type", r[0]);
    res.end(r[1]);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
}

const tmp = async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "agent-generator-v06-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
};

test("robots.txt, caminhos privados, JSON-LD, APIs de plataforma e espelho", () => {
  const r = parseRobots("User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /privado\nAllow: /privado/publico\nDisallow: /*.pdf$\nCrawl-delay: 2\nSitemap: https://x.com/s.xml");
  assert.deepEqual([r.allowed("/privado/a"), r.allowed("/privado/publico/b"), r.allowed("/a.pdf"), r.allowed("/a.pdfx"), r.allowed("/")], [false, true, false, true, true]);
  assert.equal(r.delayMs, 2000);
  assert.deepEqual(r.sitemaps, ["https://x.com/s.xml"]);
  for (const p of ["/minha-conta", "/conta/pedidos", "/login.html", "/carrinho", "/checkout", "/admin", "/api/orders"]) assert.ok(PRIVATE_PATH.test(p), p);
  for (const p of ["/contato", "/produto.html", "/api/products", "/carrinhos-de-som"]) assert.ok(!PRIVATE_PATH.test(p), p);
  const items = productsFromJsonLd(`<script type="application/ld+json">${JSON.stringify({ "@graph": [{ "@type": "Product", name: "Marca Strato", brand: "Marca", offers: [{ price: "999.90" }], image: ["https://x.com/a.jpg"] }] })}</script>`, "https://x.com/p?id=1");
  assert.deepEqual(items[0], { id: "", nome: "Marca Strato", categoria: "", preco: 999.9, descricao: "", imagem: "https://x.com/a.jpg", link: "/p?id=1" });
  const shop = productsFromApi("/products.json", { products: [{ id: 1, title: "Pedal", vendor: "Boss", handle: "pedal", variants: [{ price: "300.00" }] }] });
  assert.equal(shop[0].link, "/products/pedal");
  assert.equal(shop[0].preco, 300);
  const woo = productsFromApi("/wp-json/wc/store/v1/products?per_page=100", [{ id: 5, name: "Cabo", prices: { price: "4990", currency_minor_unit: 2 }, permalink: "https://x.com/produto/cabo/" }]);
  assert.equal(woo[0].preco, 49.9);
  assert.equal(woo[0].link, "/produto/cabo/");
  assert.equal(mirrorFile("/"), "index.html");
  assert.equal(mirrorFile("/sobre"), "sobre/index.html");
  assert.ok(!mirrorFile("/../../etc/passwd").split("/").includes(".."));
  assert.equal(cspAdvice(""), "");
  assert.match(cspAdvice("default-src 'self'; script-src 'self'; style-src 'self' https: 'unsafe-inline'"), /script-src, connect-src/);
  assert.equal(cspAdvice("default-src 'self' https:"), "", "https: já libera o serviço");
});

test("crawler: só páginas públicas do próprio site, sem área de conta nem bloqueadas", async (t) => {
  const store = await fakeStore(t);
  const crawl = await crawlSite(store.url, { delayMs: 0 });
  const paths = crawl.pages.map((p) => p.path).sort();
  assert.deepEqual(paths, ["/", "/contato", "/faq", "/produto?id=g1", "/produto?id=g2", "/sobre"]);
  assert.ok(!store.requests.some((u) => /minha-conta|carrinho|privado/.test(u)), store.requests.join(" "));
  assert.equal(crawl.catalogApi, "/api/products");
  assert.equal(crawl.products.length, 3, "API e JSON-LD sem repetição");
  assert.match(crawl.avisos.join(" "), /1 página\(s\) bloqueadas/);
});

test("site publicado -> pasta agente-servico pronta; serviço com CORS, catálogo vivo e IA que reescreve", async (t) => {
  const store = await fakeStore(t);
  const out = join(await tmp(t), "agente-loja");
  const r = await buildFromSite(store.url, out, { delayMs: 0 });
  assert.equal(r.paginas, 6);
  assert.equal(r.catalogoApi, "/api/products");
  assert.ok(r.geral >= 70, `acerto ${r.geral}`);
  const svc = join(out, "agente-servico");
  for (const f of ["servico.js", "package.json", "Dockerfile", ".env.exemplo", "servico.config.json", "agente/widget.js", "agente/servidor.js", ...CORE_FILES.map((c) => `agente/nucleo/${c}`)]) await access(join(svc, f));
  for (const f of ["render.yaml", "LEIA-ME.md", ".gitignore", ".github/workflows/atualizar-agente.yml"]) await access(join(out, f));
  assert.match(await readFile(join(out, "render.yaml"), "utf8"), /rootDir: agente-servico/);
  assert.match(await readFile(join(out, ".github/workflows/atualizar-agente.yml"), "utf8"), /--so-conteudo/);
  const agente = JSON.parse(await readFile(join(svc, "agente", "conhecimento", "agente.json"), "utf8"));
  assert.equal(agente.endpoint, "../api/agente");
  const catalogo = JSON.parse(await readFile(join(svc, "agente", "conhecimento", "catalogo.json"), "utf8"));
  assert.equal(catalogo.url, "/api/products");
  const paginas = JSON.parse(await readFile(join(svc, "agente", "conhecimento", "paginas.json"), "utf8"));
  assert.ok(paginas.some((p) => p.href === "/sobre"), "caminho original do site, não o do espelho");
  const faq = JSON.parse(await readFile(join(svc, "agente", "conhecimento", "faq.json"), "utf8"));
  assert.ok(faq.some((f) => /prazo de entrega/i.test(f.pergunta) && f.link === "/faq#prazo"));
  assert.match(await readFile(join(out, "render.yaml"), "utf8"), new RegExp(`value: ${store.url.replace(/[.]/g, "\\.")}`));
  assert.match(await readFile(join(out, "agente-gerador", "config.json"), "utf8"), /"modo": "servico"/);

  // Serviço: IA simulada (Gemini) que reescreve a frase.
  let iaCalls = 0;
  const fetchImpl = async (url, init) => {
    if (String(url).includes("generativelanguage")) {
      iaCalls++;
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"frase": "qual o prazo de entrega?"}' }] } }] }) };
    }
    return fetch(url, init);
  };
  const { createService } = await import(pathToFileURL(join(svc, "servico.js")).href);
  const { server } = await createService({ env: { ORIGENS: "https://minhaloja.test", IA_PROVEDOR: "gemini", IA_CHAVE: "chave-teste", SITE_URL: store.url }, fetchImpl });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const ok = { origin: "https://minhaloja.test" };
  const w = await fetch(`${base}/agente/widget.js`, { headers: ok });
  assert.equal(w.status, 200);
  assert.equal(w.headers.get("access-control-allow-origin"), "https://minhaloja.test");
  const evil = await fetch(`${base}/agente/widget.js`, { headers: { origin: "https://outra.test" } });
  assert.equal(evil.headers.get("access-control-allow-origin"), null);
  const post = (mensagem, origin = ok.origin) => fetch(`${base}/api/agente`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ mensagem }) });
  assert.equal((await post("oi", "https://outra.test")).status, 403);
  const pre = await fetch(`${base}/api/agente`, { method: "OPTIONS", headers: { ...ok, "access-control-request-method": "POST" } });
  assert.equal(pre.status, 204);
  const prazo = await (await post("qual o prazo de entrega?")).json();
  assert.match(prazo.texto, /7 dias úteis/);
  assert.equal(iaCalls, 0, "o agente entendeu sozinho: a IA não é chamada");
  const ia = await (await post("zzkx quando chega meu trem comprado aí")).json();
  assert.equal(ia.fonte, "ia-interpretou");
  assert.equal(ia.interpretado, "qual o prazo de entrega?");
  assert.match(ia.texto, /7 dias úteis/);
  assert.equal(iaCalls, 1);
  assert.equal(ia.faltaLocal, undefined);
  const faltas = await readFile(join(svc, "faltas.jsonl"), "utf8");
  assert.match(faltas, /zzkx/, "o que o agente não entendeu sozinho fica registrado para o aprender");
  const saude = await (await fetch(`${base}/saude`)).json();
  assert.deepEqual([saude.ia, saude.itens], ["gemini", 3]);
  assert.ok(saude.catalogoAtualizadoEm);
  assert.equal((await fetch(`${base}/agente/%2e%2e/servico.js`)).status, 404);
  assert.equal((await fetch(`${base}/agente/servidor.js`)).status, 404);
  assert.match(await (await fetch(`${base}/`)).text(), /widget\.js/);

  // Atualização só do conteúdo mantém as edições da base.
  const intencoes = join(svc, "agente", "conhecimento", "intencoes.json");
  const edited = { ...JSON.parse(await readFile(intencoes, "utf8")), editada: { exemplos: ["frase editada", "outra editada"], respostas: ["ok"] } };
  await writeFile(intencoes, JSON.stringify(edited));
  await buildFromSite(store.url, out, { delayMs: 0, soConteudo: true });
  assert.match(await readFile(intencoes, "utf8"), /frase editada/);
});

test("IA: configuração, provedor compatível com OpenAI/Ollama, falhas e resposta livre opcional", async () => {
  assert.equal(iaConfig({}), null);
  assert.equal(iaConfig({ IA_PROVEDOR: "gemini" }), null, "Gemini sem chave");
  const ollama = iaConfig({ IA_PROVEDOR: "openai", IA_URL: "http://localhost:11434/v1", IA_MODELO: "llama3.2" });
  assert.deepEqual([ollama.provedor, ollama.chave, ollama.modelo], ["openai", "", "llama3.2"]);
  assert.equal(iaConfig({ IA_PROVEDOR: "openai", IA_URL: "https://api.groq.com/openai/v1" }), null, "remoto sem chave");
  assert.equal(iaConfig({ IA_PROVEDOR: "gemini", GEMINI_API_KEY: "k", IA_MODELO: "x; rm" }).modelo, "gemini-3.5-flash-lite");
  const agent = createAgent({ agente: { nome: "Ajuda", site: "Loja" }, faq: [{ pergunta: "Qual o prazo de entrega?", resposta: "Até 7 dias úteis." }] });
  assert.match(instructions(agent.knowledge), /Qual o prazo de entrega\?/);
  assert.match(instructions(agent.knowledge, { respostaLivre: true }), /"texto"/);
  let sent;
  const openai = async (url, init) => {
    sent = { url, init, body: JSON.parse(init.body) };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Claro: {"frase": "prazo de entrega", "texto": "<b>Chega</b> em 7 dias."}' } }] }) };
  };
  const g = await interpret("meu email é a@b.com, quando chega?", agent.knowledge, ollama, { fetchImpl: openai });
  assert.deepEqual(g, { frase: "prazo de entrega", texto: "" }, "texto livre só com IA_RESPOSTA_LIVRE");
  assert.equal(sent.url, "http://localhost:11434/v1/chat/completions");
  assert.equal(sent.init.headers.authorization, undefined);
  assert.doesNotMatch(sent.body.messages[1].content, /a@b\.com/, "dado pessoal não sai");
  const livre = await interpret("x", agent.knowledge, { ...ollama, respostaLivre: true }, { fetchImpl: openai });
  assert.equal(livre.texto, "Chega em 7 dias.");
  const diag = {};
  assert.equal(await interpret("x", agent.knowledge, ollama, { fetchImpl: async () => ({ ok: false, status: 429 }), diag }), null);
  assert.equal(diag.status, 429);
  assert.equal(cleanPhrase("igual", "Igual!"), "");
  // Limite por minuto: acima dele, fica a resposta local.
  let calls = 0;
  const wrapped = withIa(agent, { ...ollama, porMinuto: 1 }, { fetchImpl: async (...a) => (calls++, openai(...a)), now: () => 0 });
  assert.equal((await wrapped.replyAsync("xpto qwe")).fonte, "ia-interpretou");
  assert.notEqual((await wrapped.replyAsync("xpto asd")).fonte, "ia-interpretou");
  assert.equal(calls, 1);
  assert.equal(withIa(agent, null).ia, null);
});

test("CLI site: exige confirmação de autorização fora do terminal", () => {
  const r = spawnSync(process.execPath, [join(ROOT, "bin", "agent-generator.js"), "site", "http://127.0.0.1:9"], { encoding: "utf8", input: "" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--sim/);
});
