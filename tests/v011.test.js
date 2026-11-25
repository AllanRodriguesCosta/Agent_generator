// Versão 0.11: chave de IA no instalador (OpenRouter em 1 clique, Gemini assistido, cofre local) e
// serviço do agente na Cloudflare (a chave vira segredo; sem variável no Render ou Action).
// Versão 0.12: site já publicado no instalador (sem clonar, sem novo deploy), linha para colar,
// guia por plataforma, plugin WordPress, prévia e verificação.
// Nada aqui sai para a internet: Cloudflare, OpenRouter e Google são simulados no fetch.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile, cp } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, EXAMPLE, exampleCopy } from "./helpers.js";
import { iaConfig, dailyLimiter, vocabulary, withRemoteIa, remoteInterpret } from "../src/agent/ia.js";
import { checkKnowledge } from "../src/agent/knowledge.js";
import { createAgent } from "../src/agent/agent.js";
import { pkcePair, openRouterAuthUrl, testKey, maskKey, iaEnv } from "../src/ia/provedores.js";
import { connectOpenRouter } from "../src/ia/openrouter.js";
import { readVault, writeVault, updateVault, forget, vaultView, cofreFile } from "../src/ia/cofre.js";
import { tokenTemplateUrl, serviceName, connectCloudflare, publishService, removeService, readServiceMisses, workerModules, assetManifest, ASSET_HEADERS } from "../src/publicar/cloudflare.js";
import { embedTags, loaderScript, detectPlatform, platformGuides, zipFiles, crc32, wordpressPlugin, verifyInstall, startPreview } from "../src/publicar/site.js";
import { generateKnowledge } from "../src/generator/index.js";
import { scanProject } from "../src/scanner/index.js";
import { main } from "../bin/agent-generator.js";

const tmp = async (t, prefixo = "ag-v011-") => {
  const dir = await mkdtemp(join(tmpdir(), prefixo));
  // No Windows, apagar logo depois de fechar um servidor pode dar EBUSY por um instante.
  t.after(() => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return dir;
};
// Cofre só deste arquivo de teste (nunca o do usuário).
const COFRE_DIR = await mkdtemp(join(tmpdir(), "ag-cofre-"));
process.env.AGENTE_COFRE = join(COFRE_DIR, "cofre.json");
test.after(() => rm(COFRE_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const urlOf = (input) => (typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
const until = async (fn, { vezes = 400, ms = 50 } = {}) => {
  for (let i = 0; i < vezes; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, ms));
  }
  throw new Error("tempo esgotado");
};

// ---------- simuladores ----------
const OR_KEY = "sk-or-v1-chave-de-teste-0123456789abcdef";
function fakeOpenRouter({ freeTier = true, frase = "qual o horario de funcionamento" } = {}) {
  const calls = [];
  return {
    calls,
    async handle(url, init = {}) {
      calls.push({ url, init });
      if (url.endsWith("/auth/keys")) {
        const b = JSON.parse(init.body);
        return b.code === "codigo-bom" && b.code_challenge_method === "S256" && b.code_verifier ? json({ key: OR_KEY }) : json({ error: "invalid" }, 403);
      }
      if (url.endsWith("/api/v1/key")) return init.headers?.authorization === `Bearer ${OR_KEY}` ? json({ data: { label: "x", is_free_tier: freeTier } }) : json({ error: "no" }, 401);
      if (url.endsWith("/api/v1/models")) return json({ data: [{ id: "openai/gpt-4o-mini" }, { id: "google/gemini-2.5-flash-lite" }, { id: "meta-llama/llama-3.3-70b-instruct:free" }] });
      if (url.endsWith("/chat/completions")) return json({ choices: [{ message: { content: JSON.stringify({ frase }) } }] });
      return json({}, 404);
    },
  };
}

function fakeCloudflare({ subdominio = "", contas = [{ id: "c0ffee00c0ffee00c0ffee00c0ffee00", name: "Conta da Loja" }] } = {}) {
  const st = { calls: [], scripts: {}, kv: [], kvKeys: [], subdominio, uploads: [], deletes: [] };
  const ok = (result, extra = {}) => json({ success: true, errors: [], messages: [], result, ...extra });
  st.handle = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || "GET";
    const path = u.pathname.replace("/client/v4", "");
    const auth = init.headers?.authorization || "";
    st.calls.push(`${method} ${path}`);
    if (path === "/user/tokens/verify") return auth === "Bearer cf-token-de-teste-1234567890" ? ok({ id: "t", status: "active" }) : json({ success: false, errors: [{ code: 1000, message: "Invalid API Token" }] }, 401);
    if (!path.startsWith("/accounts/workers/assets") && !/assets\/upload/.test(path) && auth !== "Bearer cf-token-de-teste-1234567890") return json({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }, 403);
    if (path === "/accounts") return ok(contas);
    const conta = contas[0].id;
    if (path === `/accounts/${conta}/workers/subdomain`) {
      if (method === "GET") return st.subdominio ? ok({ subdomain: st.subdominio }) : json({ success: false, errors: [{ code: 10007, message: "not found" }] }, 404);
      st.subdominio = JSON.parse(init.body).subdomain;
      return ok({ subdomain: st.subdominio });
    }
    if (path === `/accounts/${conta}/storage/kv/namespaces` && method === "GET") return ok(st.kv);
    if (path === `/accounts/${conta}/storage/kv/namespaces` && method === "POST") {
      const n = { id: `kv${st.kv.length + 1}`, title: JSON.parse(init.body).title };
      st.kv.push(n);
      return ok(n);
    }
    let m = path.match(/^\/accounts\/[^/]+\/workers\/scripts\/([^/]+)\/assets-upload-session$/);
    if (m) {
      st.manifest = JSON.parse(init.body).manifest;
      const hashes = Object.values(st.manifest).map((x) => x.hash);
      return ok({ jwt: "jwt-de-envio", buckets: [hashes.slice(0, 3), hashes.slice(3)].filter((b) => b.length) });
    }
    if (path === `/accounts/${conta}/workers/assets/upload`) {
      assert.equal(u.searchParams.get("base64"), "true");
      assert.equal(auth, "Bearer jwt-de-envio", "upload usa o jwt da sessão, não o token");
      const form = init.body;
      for (const [hash, file] of form.entries()) st.uploads.push({ hash, type: file.type, b64: await file.text() });
      return ok({ jwt: st.uploads.length >= Object.keys(st.manifest).length ? "jwt-final" : null });
    }
    m = path.match(/^\/accounts\/[^/]+\/workers\/scripts\/([^/]+)$/);
    if (m && method === "PUT") {
      const form = init.body;
      const metadata = JSON.parse(await form.get("metadata").text());
      const modulos = {};
      for (const [name, file] of form.entries()) if (name !== "metadata") modulos[name] = { type: file.type, code: await file.text() };
      st.scripts[m[1]] = { metadata, modulos };
      return ok({ id: m[1] });
    }
    if (m && method === "DELETE") {
      st.deletes.push(m[1]);
      delete st.scripts[m[1]];
      return ok(null);
    }
    m = path.match(/^\/accounts\/[^/]+\/workers\/scripts\/([^/]+)\/subdomain$/);
    if (m) {
      st.habilitado = { nome: m[1], ...JSON.parse(init.body) };
      return ok({ enabled: true, previews_enabled: false });
    }
    m = path.match(/^\/accounts\/[^/]+\/storage\/kv\/namespaces\/([^/]+)\/keys$/);
    if (m) {
      const cursor = u.searchParams.get("cursor") || "";
      const pagina = cursor ? st.kvKeys.slice(2) : st.kvKeys.slice(0, 2);
      return ok(pagina, { result_info: { cursor: cursor ? "" : st.kvKeys.length > 2 ? "c2" : "" } });
    }
    m = path.match(/^\/accounts\/[^/]+\/storage\/kv\/namespaces\/([^/]+)$/);
    if (m && method === "DELETE") {
      st.deletes.push(`kv:${m[1]}`);
      return ok(null);
    }
    return json({ success: false, errors: [{ code: 7003, message: `rota simulada desconhecida: ${method} ${path}` }] }, 404);
  };
  return st;
}

// Troca o fetch global: APIs externas simuladas, o resto (sites locais) passa direto.
function stubFetch(t, { cf, or, gemini, saude = true } = {}) {
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = urlOf(input);
    if (cf && url.startsWith("https://api.cloudflare.com/")) return cf.handle(url, init);
    if (or && url.startsWith("https://openrouter.ai/")) return or.handle(url, init);
    if (gemini && url.startsWith("https://generativelanguage.googleapis.com/")) return gemini(url, init);
    if (/\.workers\.dev\/saude$/.test(url)) return saude ? json({ ok: true, ia: "openrouter", modo: "completo" }) : new Response("", { status: 522 });
    return real(input, init);
  };
  t.after(() => {
    globalThis.fetch = real;
  });
}

// ---------- núcleo: IA remota e limites ----------
test("núcleo: openrouter no iaConfig, limite por dia e vocabulário enxuto", async () => {
  const c = iaConfig({ IA_PROVEDOR: "openrouter", IA_CHAVE: OR_KEY });
  assert.equal(c.baseUrl, "https://openrouter.ai/api/v1");
  assert.equal(c.modelo, "google/gemini-2.5-flash-lite");
  assert.equal(c.porDia, 300);
  assert.equal(iaConfig({ IA_PROVEDOR: "openrouter" }), null, "sem chave, sem IA");
  let agora = 0;
  const dia = dailyLimiter(2, () => agora);
  assert.deepEqual([dia(), dia(), dia()], [true, true, false]);
  agora = 86400000;
  assert.equal(dia(), true, "novo dia, nova cota");
  const k = generateKnowledge(await scanProject(EXAMPLE)).knowledge;
  const v = vocabulary(k);
  assert.ok(Object.keys(v.intencoes).length > 3);
  assert.ok(Object.values(v.intencoes).every((i) => i.exemplos.length <= 3));
  assert.ok(v.catalogo.itens.length > 0 && v.catalogo.itens.length <= 80);
  assert.ok(JSON.stringify(v).length < JSON.stringify(k).length / 3, "bem menor que a base");
  const semCatalogo = vocabulary({ ...k, agente: { ...k.agente, recursos: { ...k.agente.recursos, catalogo: false } } });
  assert.equal(semCatalogo.catalogo.itens.length, 0, "catálogo desligado não vai para a IA");
});

test("widget: agente no navegador chama o serviço só quando não entende (e manda a frase anônima)", async () => {
  const k = generateKnowledge(await scanProject(EXAMPLE)).knowledge;
  const agent = createAgent(k);
  const chamadas = [];
  const fetchImpl = async (url, init) => {
    chamadas.push({ url, body: JSON.parse(init.body) });
    return json({ frase: "qual o horario" });
  };
  const r = withRemoteIa(agent, "https://agente-x.y.workers.dev/api/ia", { fetchImpl });
  const entendida = await r.replyAsync("qual o horario");
  assert.equal(chamadas.length, 0, "entendida aqui: não chama o serviço");
  assert.notEqual(entendida.fonte, "ia-interpretou");
  const ajudada = await r.replyAsync("zorbl quank fizzle? meu email é ana@x.com");
  assert.equal(chamadas.length, 1);
  assert.doesNotMatch(chamadas[0].body.mensagem, /ana@x\.com/, "e-mail não sai do navegador");
  assert.equal(ajudada.fonte, "ia-interpretou");
  assert.equal(ajudada.interpretado, "qual o horario");
  // Serviço fora do ar ou sem IA: fica a resposta local.
  const fora = withRemoteIa(agent, "https://x/api/ia", { fetchImpl: async () => new Response("", { status: 500 }) });
  assert.ok((await fora.replyAsync("xpto blablabla zzz")).texto);
  assert.equal(await remoteInterpret("https://x/api/ia", "oi", { fetchImpl: async () => json({}) }), null);
  // Limite por minuto por visitante.
  let n = 0;
  const lim = withRemoteIa(agent, "https://x/api/ia", { porMinuto: 2, fetchImpl: async () => (n++, json({})) });
  for (let i = 0; i < 4; i++) await lim.replyAsync(`frase estranha numero ${i} xpto`);
  assert.equal(n, 2);
});

test("base: agente.ia.endpoint aceita https, relativo ao widget e localhost; recusa o resto", () => {
  const ia = (endpoint) => checkKnowledge({ agente: { ia: { endpoint } } }).knowledge.agente.ia;
  assert.deepEqual(ia("https://agente-loja.sub.workers.dev/api/ia"), { endpoint: "https://agente-loja.sub.workers.dev/api/ia" });
  assert.deepEqual(ia("../api/ia"), { endpoint: "../api/ia" });
  assert.deepEqual(ia("http://127.0.0.1:8787/api/ia"), { endpoint: "http://127.0.0.1:8787/api/ia" });
  assert.equal(ia("http://inseguro.com/api/ia"), null);
  assert.equal(ia("javascript:alert(1)"), null);
  assert.equal(checkKnowledge({}).knowledge.agente.ia, null);
});

// ---------- chave: provedores, OpenRouter em 1 clique e cofre ----------
test("PKCE e link do OpenRouter", () => {
  const { verifier, challenge } = pkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(challenge, createHash("sha256").update(verifier).digest("base64url"));
  const u = new URL(openRouterAuthUrl({ callback: "http://127.0.0.1:5555/openrouter/retorno", challenge, state: "abc" }));
  assert.equal(u.origin + u.pathname, "https://openrouter.ai/auth");
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.equal(u.searchParams.get("callback_url"), "http://127.0.0.1:5555/openrouter/retorno");
  assert.equal(u.searchParams.get("state"), "abc");
});

test("OpenRouter em 1 clique: retorno local, state conferido, código trocado pela chave", async () => {
  const or = fakeOpenRouter();
  let aberto = "";
  const c = await connectOpenRouter({ abrir: (url) => (aberto = url), fetchImpl: (url, init) => or.handle(url, init) });
  assert.equal(aberto, c.url, "abre o login no navegador");
  const auth = new URL(c.url);
  const retorno = new URL(auth.searchParams.get("callback_url"));
  assert.equal(retorno.hostname, "127.0.0.1");
  // Retorno de outra tentativa: ignorado, continua esperando.
  const errado = await fetch(`${retorno.href}?code=codigo-bom&state=outro`);
  assert.equal(errado.status, 400);
  const certo = await fetch(`${retorno.href}?code=codigo-bom&state=${auth.searchParams.get("state")}`);
  assert.equal(certo.status, 200);
  assert.match(await certo.text(), /OpenRouter conectado/);
  assert.equal(await c.chave, OR_KEY);
  const troca = or.calls.find((x) => x.url.endsWith("/auth/keys"));
  assert.ok(JSON.parse(troca.init.body).code_verifier, "PKCE: manda o verificador");
  // Negou o acesso: sem código.
  const neg = await connectOpenRouter({ fetchImpl: (url, init) => or.handle(url, init) });
  const r2 = new URL(new URL(neg.url).searchParams.get("callback_url"));
  await fetch(r2.href);
  await assert.rejects(neg.chave, /cancelada/);
  // Tempo esgotado.
  const lento = await connectOpenRouter({ tempoMs: 30, fetchImpl: (url, init) => or.handle(url, init) });
  await assert.rejects(lento.chave, /tempo/);
});

test("testar chave: Gemini, OpenRouter (conta sem crédito usa modelo gratuito) e compatível com OpenAI", async () => {
  const gemini = async (url, init) => (init.headers["x-goog-api-key"] === "AIzaChaveBoaDeTeste1234567890" ? json({ models: [{ name: "models/gemini-2.5-flash-lite", supportedGenerationMethods: ["generateContent"] }, { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] }] }) : json({ error: { message: "API key not valid" } }, 400));
  const g = await testKey({ provedor: "gemini", chave: "  AIzaChaveBoaDeTeste1234567890 " }, { fetchImpl: gemini });
  assert.equal(g.ok, true);
  assert.equal(g.modelo, "gemini-2.5-flash-lite");
  assert.equal(g.chave, "AIzaChaveBoaDeTeste1234567890", "espaços e aspas fora");
  const ruim = await testKey({ provedor: "gemini", chave: "AIzaChaveRuimDeTeste1234567890" }, { fetchImpl: gemini });
  assert.equal(ruim.ok, false);
  assert.match(ruim.mensagem, /Google não aceitou/);
  assert.match((await testKey({ provedor: "gemini", chave: "curta" })).mensagem, /não parece uma chave/);
  const or = fakeOpenRouter({ freeTier: true });
  const o = await testKey({ provedor: "openrouter", chave: OR_KEY }, { fetchImpl: (u, i) => or.handle(u, i) });
  assert.equal(o.ok, true);
  assert.equal(o.modelo, "meta-llama/llama-3.3-70b-instruct:free");
  const pago = fakeOpenRouter({ freeTier: false });
  assert.equal((await testKey({ provedor: "openrouter", chave: OR_KEY }, { fetchImpl: (u, i) => pago.handle(u, i) })).modelo, "google/gemini-2.5-flash-lite");
  const local = await testKey({ provedor: "openai", baseUrl: "http://localhost:11434/v1", modelo: "llama3.2" }, { fetchImpl: async () => json({ data: [{ id: "llama3.2" }] }) });
  assert.equal(local.ok, true);
  assert.match((await testKey({ provedor: "openai", baseUrl: "http://servidor.com/v1", chave: "x" })).mensagem, /https/);
  assert.match((await testKey({ provedor: "gemini", chave: "AIzaChaveBoaDeTeste1234567890" }, { fetchImpl: async () => { throw new Error("rede"); } })).mensagem, /internet/);
  assert.deepEqual(iaEnv({ provedor: "openrouter", chave: "k", baseUrl: "https://openrouter.ai/api/v1", modelo: "m" }), { IA_PROVEDOR: "openrouter", IA_CHAVE: "k", IA_URL: "https://openrouter.ai/api/v1", IA_MODELO: "m" });
});

test("cofre: fora do projeto, só o dono lê, nunca mostra a chave inteira", async (t) => {
  const dir = await tmp(t);
  const file = join(dir, "sub", "cofre.json");
  // Caminho exato de cada sistema, rodando em qualquer um (o CI testa Windows e Linux).
  assert.equal(cofreFile({ APPDATA: "C:\\Users\\a\\AppData\\Roaming" }, "win32"), "C:\\Users\\a\\AppData\\Roaming\\agent-generator\\cofre.json");
  assert.equal(cofreFile({ XDG_CONFIG_HOME: "/home/a/.config" }, "linux"), "/home/a/.config/agent-generator/cofre.json");
  assert.deepEqual(await readVault(file), {});
  await writeVault({ ia: { provedor: "gemini", chave: "AIzaSegredoMuitoSecreto123456", modelo: "m" }, cloudflare: { token: "cf-token-secreto-1234567890", conta: "Loja", contaId: "c" } }, file);
  if (process.platform !== "win32") assert.equal((await stat(file)).mode & 0o777, 0o600);
  const view = vaultView(await readVault(file));
  assert.equal(view.ia.chave, maskKey("AIzaSegredoMuitoSecreto123456"));
  assert.doesNotMatch(JSON.stringify(view), /SegredoMuitoSecreto|token-secreto/);
  await forget("ia", file);
  const depois = await readVault(file);
  assert.equal(depois.ia, undefined);
  assert.ok(depois.cloudflare.token);
  // Duas gravações ao mesmo tempo (ex.: chave do OpenRouter chegando enquanto a Cloudflare é salva).
  await Promise.all([updateVault((c) => void (c.a = 1), file), updateVault((c) => void (c.b = 2), file), writeVault({ ...depois, a: 1, b: 2 }, file)]);
  const juntos = await readVault(file);
  assert.deepEqual([juntos.a, juntos.b, Boolean(juntos.cloudflare?.token)], [1, 2, true], "nenhuma gravação se perde");
  assert.deepEqual((await readdir(dirname(file))).filter((f) => f.endsWith(".tmp")), [], "sem arquivo temporário sobrando");
  await forget("tudo", file);
  assert.deepEqual(await readVault(file), {});
});

// ---------- serviço do agente na Cloudflare ----------
test("Cloudflare: link do token com as permissões, nome do serviço e conexão", async (t) => {
  const link = new URL(tokenTemplateUrl());
  const perms = JSON.parse(link.searchParams.get("permissionGroupKeys"));
  assert.deepEqual(perms.map((p) => `${p.key}:${p.type}`), ["workers_scripts:edit", "workers_kv_storage:edit", "account_settings:read"]);
  assert.equal(link.searchParams.get("accountId"), "*");
  assert.equal(serviceName("https://www.Minha-Loja.com.br/"), "agente-minha-loja-com-br");
  assert.ok(serviceName("https://" + "a".repeat(90) + ".com").length <= 53);
  const cf = fakeCloudflare();
  const f = (u, i) => cf.handle(urlOf(u), i);
  const c = await connectCloudflare("cf-token-de-teste-1234567890", { fetchImpl: f });
  assert.equal(c.conta, "Conta da Loja");
  assert.equal(c.subdominio, "", "conta nova ainda sem workers.dev");
  await assert.rejects(connectCloudflare("token-errado-de-teste-123456", { fetchImpl: f }), /não aceitou a chave de publicação/);
  await assert.rejects(connectCloudflare("curto"), /não parece/);
});

test("Cloudflare: publica (cria workers.dev, KV, arquivos estáticos, segredo) e remove", async (t) => {
  const cf = fakeCloudflare();
  const f = (u, i) => cf.handle(urlOf(u), i);
  const site = await exampleCopy(t);
  const k = generateKnowledge(await scanProject(site)).knowledge;
  const agentDir = join(site, "agente");
  await mkdir(join(agentDir, "conhecimento"), { recursive: true });
  await writeFile(join(agentDir, "widget.js"), "export const w = 1;\n");
  await writeFile(join(agentDir, "widget.css"), ".agw{}\n");
  await writeFile(join(agentDir, "servidor.js"), "// não publica\n");
  await writeFile(join(agentDir, "conhecimento", "agente.json"), JSON.stringify(k.agente));
  const { agentAssets } = await import("../src/publicar/cloudflare.js");
  const assets = await agentAssets(agentDir);
  assert.deepEqual(Object.keys(assets).sort(), ["/agente/conhecimento/agente.json", "/agente/widget.css", "/agente/widget.js"]);
  const log = [];
  const r = await publishService(
    { token: "cf-token-de-teste-1234567890", contaId: "c0ffee00c0ffee00c0ffee00c0ffee00", conta: "Conta da Loja", site: "https://cafe.com.br", origens: ["https://cafe.com.br"], knowledge: k, assets, ia: { provedor: "openrouter", modelo: "m", baseUrl: "https://openrouter.ai/api/v1" }, chave: OR_KEY, versao: "0.11.0" },
    { fetchImpl: f, log: (l) => log.push(l), healthTries: 1 },
  );
  assert.equal(cf.subdominio, "conta-da-loja");
  assert.equal(r.url, "https://agente-cafe-com-br.conta-da-loja.workers.dev");
  assert.equal(r.modo, "completo");
  assert.equal(r.kvId, "kv1");
  const s = cf.scripts["agente-cafe-com-br"];
  assert.equal(s.metadata.main_module, "worker.js");
  assert.deepEqual(Object.keys(s.modulos).sort(), ["nucleo/ia.js", "nucleo/privacy.js", "vocabulario.js", "worker.js"]);
  assert.ok(Object.values(s.modulos).every((m) => m.type === "application/javascript+module"));
  const b = Object.fromEntries(s.metadata.bindings.map((x) => [x.name, x]));
  assert.deepEqual(b.IA_CHAVE, { type: "secret_text", name: "IA_CHAVE", text: OR_KEY });
  assert.equal(b.ORIGENS.text, "https://cafe.com.br");
  assert.equal(b.IA_PROVEDOR.text, "openrouter");
  assert.deepEqual(b.FALTAS, { type: "kv_namespace", name: "FALTAS", namespace_id: "kv1" });
  assert.equal(s.metadata.assets.jwt, "jwt-final");
  assert.equal(s.metadata.assets.config._headers, ASSET_HEADERS);
  assert.match(ASSET_HEADERS, /Access-Control-Allow-Origin: \*/);
  assert.equal(cf.uploads.length, 3);
  const widget = cf.uploads.find((x) => Buffer.from(x.b64, "base64").toString() === "export const w = 1;\n");
  assert.match(widget.type, /javascript/);
  assert.deepEqual(cf.habilitado, { nome: "agente-cafe-com-br", enabled: true, previews_enabled: false });
  assert.ok(log.some((l) => /workers\.dev/.test(l)));
  // Nova publicação sem chave nova: mantém o segredo (inherit). Sem IA: nenhuma chave.
  await publishService({ token: "cf-token-de-teste-1234567890", contaId: "c0ffee00c0ffee00c0ffee00c0ffee00", subdominio: "conta-da-loja", site: "https://cafe.com.br", knowledge: k, ia: { provedor: "gemini" } }, { fetchImpl: f, healthTries: 0 });
  assert.deepEqual(cf.scripts["agente-cafe-com-br"].metadata.bindings.find((x) => x.name === "IA_CHAVE"), { type: "inherit", name: "IA_CHAVE" });
  assert.equal(cf.scripts["agente-cafe-com-br"].metadata.assets, undefined, "modo ia: sem arquivos estáticos");
  await publishService({ token: "cf-token-de-teste-1234567890", contaId: "c0ffee00c0ffee00c0ffee00c0ffee00", subdominio: "conta-da-loja", site: "https://cafe.com.br", knowledge: k, ia: null, chave: "" }, { fetchImpl: f, healthTries: 0 });
  assert.equal(cf.scripts["agente-cafe-com-br"].metadata.bindings.some((x) => /^IA_/.test(x.name)), false);
  // Frases guardadas (com paginação) e remoção.
  cf.kvKeys = ["2026-11-25T10:00:00.000Z", "2026-11-25T10:01:00.000Z", "2026-11-25T10:02:00.000Z"].map((d, i) => ({ name: `f:${d}:ab${i}`, metadata: { f: `frase ${i}` } }));
  const faltas = await readServiceMisses({ token: "cf-token-de-teste-1234567890", contaId: "c0ffee00c0ffee00c0ffee00c0ffee00", kvId: "kv1" }, { fetchImpl: f });
  assert.deepEqual(faltas, [{ frase: "frase 0", em: "2026-11-25T10:00:00.000Z" }, { frase: "frase 1", em: "2026-11-25T10:01:00.000Z" }, { frase: "frase 2", em: "2026-11-25T10:02:00.000Z" }]);
  await removeService({ token: "cf-token-de-teste-1234567890", contaId: "c0ffee00c0ffee00c0ffee00c0ffee00", nome: "agente-cafe-com-br", kvId: "kv1" }, { fetchImpl: f });
  assert.deepEqual(cf.deletes, ["agente-cafe-com-br", "kv:kv1"]);
  assert.equal(assetManifest({ "/a.js": { body: Buffer.from("x"), type: "t" } }).manifest["/a.js"].hash.length, 32);
});

// O Worker de verdade, rodando no Node com o mesmo grafo de módulos que vai para a Cloudflare.
async function loadWorker(t, knowledge) {
  const dir = await tmp(t, "ag-worker-");
  for (const [name, code] of Object.entries(await workerModules(knowledge))) {
    await mkdir(dirname(join(dir, name)), { recursive: true });
    await writeFile(join(dir, name), code);
  }
  await writeFile(join(dir, "package.json"), '{"type":"module"}');
  return (await import(pathToFileURL(join(dir, "worker.js")).href)).default;
}

test("Worker: IA com a chave secreta, origem conferida, limites, frases guardadas sem dado pessoal", async (t) => {
  const k = generateKnowledge(await scanProject(EXAMPLE)).knowledge;
  const worker = await loadWorker(t, k);
  const or = fakeOpenRouter({ frase: "qual o horario" });
  stubFetch(t, { or });
  const kv = [];
  const env = { SITE: "https://cafe.com.br", ORIGENS: "https://cafe.com.br,https://www.cafe.com.br", IA_PROVEDOR: "openrouter", IA_CHAVE: OR_KEY, IA_MODELO: "m", FALTAS: { put: async (key, v, o) => kv.push({ key, ...o }) } };
  const ctx = { waitUntil: (p) => p };
  const post = (origin, body, ip = "1.1.1.1") => worker.fetch(new Request("https://agente.x.workers.dev/api/ia", { method: "POST", headers: { origin, "content-type": "application/json", "cf-connecting-ip": ip }, body: JSON.stringify(body) }), env, ctx);
  const saude = await (await worker.fetch(new Request("https://agente.x.workers.dev/saude"), env, ctx)).json();
  assert.equal(saude.ia, "openrouter");
  assert.doesNotMatch(JSON.stringify(saude), /sk-or/, "a saúde nunca mostra a chave");
  const r = await post("https://www.cafe.com.br", { mensagem: "abrem cedo? meu tel (41) 99999-0000" });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), "https://www.cafe.com.br");
  assert.deepEqual(await r.json(), { frase: "qual o horario", texto: "" });
  const chamada = or.calls.find((x) => x.url.endsWith("/chat/completions"));
  assert.equal(chamada.init.headers.authorization, `Bearer ${OR_KEY}`);
  assert.doesNotMatch(chamada.init.body, /99999/, "telefone não vai para a IA");
  assert.equal(kv.length, 1);
  assert.match(kv[0].metadata.f, /\[número\]/);
  assert.equal(kv[0].expirationTtl, 90 * 86400);
  assert.equal((await post("https://golpe.com", { mensagem: "oi" })).status, 403);
  assert.equal((await post("http://localhost:5173", { mensagem: "oi" })).status, 403, "localhost só com ORIGENS_LOCAIS");
  const local = await worker.fetch(new Request("https://a/api/ia", { method: "POST", headers: { origin: "http://localhost:5173", "cf-connecting-ip": "2.2.2.2" }, body: '{"mensagem":"oi"}' }), { ...env, ORIGENS_LOCAIS: "1" }, ctx);
  assert.equal(local.status, 200);
  const pre = await worker.fetch(new Request("https://a/api/ia", { method: "OPTIONS", headers: { origin: "https://cafe.com.br" } }), env, ctx);
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get("access-control-allow-methods"), /POST/);
  // 6 por minuto por visitante.
  const statuses = [];
  for (let i = 0; i < 7; i++) statuses.push((await post("https://cafe.com.br", { mensagem: `pergunta ${i}` }, "9.9.9.9")).status);
  assert.deepEqual(statuses.slice(-2), [200, 429]);
  assert.equal((await post("https://cafe.com.br", { nada: 1 }, "8.8.8.8")).status, 400);
  assert.equal((await post("https://cafe.com.br", { mensagem: "x".repeat(5000) }, "7.7.7.7")).status, 413);
  // Sem chave: não chama IA, mas guarda a frase para o "aprender".
  const semIa = { SITE: "https://cafe.com.br", FALTAS: env.FALTAS };
  const antes = or.calls.length;
  const sr = await worker.fetch(new Request("https://a/api/ia", { method: "POST", headers: { origin: "https://cafe.com.br", "cf-connecting-ip": "3.3.3.3" }, body: '{"mensagem":"tem estacionamento"}' }), semIa, ctx);
  assert.deepEqual(await sr.json(), {});
  assert.equal(or.calls.length, antes);
  assert.ok(kv.some((x) => x.metadata.f === "tem estacionamento"));
  assert.match(await (await worker.fetch(new Request("https://a/"), { ...env, MODO: "completo" }, ctx)).text(), /<script type="module" src="https:\/\/a\/agente\/widget\.js">/);
});

// ---------- site já publicado: linha, guia, plugin, verificação e prévia ----------
test("linha para colar, carregador do GTM, plataformas e plugin WordPress (zip válido)", () => {
  const base = "https://agente-loja.sub.workers.dev/agente/";
  assert.equal(embedTags(base), '<link rel="stylesheet" href="https://agente-loja.sub.workers.dev/agente/widget.css">\n<script type="module" src="https://agente-loja.sub.workers.dev/agente/widget.js"></script>');
  assert.match(loaderScript(base), /s\.type='module'/);
  assert.doesNotMatch(embedTags('https://x/"><script>'), /"><script>/, "escapa aspas");
  assert.equal(detectPlatform('<link href="/wp-content/themes/x.css">').principal, "wordpress");
  assert.equal(detectPlatform('<script src="//cdn.shopify.com/s/x.js"></script>').principal, "shopify");
  assert.deepEqual(detectPlatform('<script src="https://www.googletagmanager.com/gtm.js?id=GTM-1"></script><p>oi</p>'), { principal: "gtm", temGtm: true, achadas: ["gtm"] });
  assert.equal(detectPlatform("<p>oi</p>").principal, "html");
  assert.deepEqual(platformGuides().map((g) => g.id), ["wordpress", "wix", "shopify", "webflow", "squarespace", "gtm", "blogger", "html"]);
  // zip: lê de volta o cabeçalho local, descomprime e confere o CRC.
  const zip = zipFiles({ "pasta/a.txt": "olá ".repeat(50), "b.txt": "x" });
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  const nameLen = zip.readUInt16LE(26);
  const size = zip.readUInt32LE(18);
  const nome = zip.subarray(30, 30 + nameLen).toString();
  assert.equal(nome, "pasta/a.txt");
  const dados = zip.readUInt16LE(8) === 8 ? inflateRawSync(zip.subarray(30 + nameLen, 30 + nameLen + size)) : zip.subarray(30 + nameLen, 30 + nameLen + size);
  assert.equal(dados.toString(), "olá ".repeat(50));
  assert.equal(zip.readUInt32LE(14), crc32(dados));
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  const end = zip.subarray(zip.length - 22);
  assert.equal(end.readUInt32LE(0), 0x06054b50);
  assert.equal(end.readUInt16LE(10), 2);
  const wp = wordpressPlugin({ base, site: "https://loja.com.br", nome: "Assistente */ da Loja" });
  const wpNome = wp.subarray(30, 30 + wp.readUInt16LE(26)).toString();
  assert.equal(wpNome, "agente-gerador-widget/agente-gerador-widget.php");
  const php = inflateRawSync(wp.subarray(30 + wp.readUInt16LE(26), 30 + wp.readUInt16LE(26) + wp.readUInt32LE(18))).toString();
  assert.match(php, /Plugin Name: Assistente {2}\/ da Loja \(Agent Generator\)/);
  assert.doesNotMatch(php, /Assistente \*\//, "o nome não fecha o comentário do PHP");
  assert.match(php, /add_action\('wp_footer'/);
  assert.match(php, /esc_url\(\$base \. 'widget\.js'\)/);
  assert.match(php, /\$base = 'https:\/\/agente-loja\.sub\.workers\.dev\/agente\/';/);
});

async function liveSite(t, { comLinha = "", csp = "" } = {}) {
  const server = createServer((req, res) => {
    if (req.method !== "GET") {
      res.statusCode = 405;
      return res.end();
    }
    if (req.url === "/" || req.url === "/index.html") {
      res.setHeader("content-type", "text/html; charset=utf-8");
      if (csp) res.setHeader("content-security-policy", csp);
      res.setHeader("set-cookie", "sessao=1");
      return res.end(`<!doctype html><html><head><title>Café</title><meta http-equiv="Content-Security-Policy" content="default-src 'self'"></head><body><h1>Café Aurora</h1><a href="/sobre">Sobre</a>${comLinha}</body></html>`);
    }
    if (req.url === "/logo.svg") {
      res.setHeader("content-type", "image/svg+xml");
      return res.end("<svg/>");
    }
    res.statusCode = 404;
    res.end("não");
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test("verificar instalação: linha na página, CSP e serviço", async (t) => {
  stubFetch(t, {});
  const servico = "https://agente-cafe.sub.workers.dev";
  const sem = await verifyInstall(await liveSite(t), servico);
  assert.equal(sem.pagina, false);
  assert.equal(sem.servico, true);
  assert.equal(sem.ok, false);
  assert.ok(sem.avisos.some((a) => /ainda não aparece/.test(a)));
  const com = await verifyInstall(await liveSite(t, { comLinha: embedTags(`${servico}/agente/`) }), servico);
  assert.equal(com.pagina, true);
  assert.ok(com.avisos.some((a) => /Content-Security-Policy/.test(a)), "a meta CSP do site bloquearia o widget");
  assert.equal(com.ok, false);
  const liberado = await verifyInstall(await liveSite(t, { comLinha: embedTags(`${servico}/agente/`), csp: `default-src 'self' ${servico}` }), servico);
  assert.equal(liberado.pagina, true);
  assert.equal(liberado.ok, true);
});

test("prévia: mostra o site publicado com o agente, sem CSP/cookie e sem enviar formulários", async (t) => {
  const site = await liveSite(t, { csp: "default-src 'self'" });
  const dir = await tmp(t);
  await mkdir(join(dir, "conhecimento"), { recursive: true });
  await writeFile(join(dir, "widget.js"), "console.log('widget');");
  await writeFile(join(dir, "servidor.js"), "segredo");
  const perguntas = [];
  const pedidos = [];
  const fetchImpl = (u, init) => (pedidos.push(String(u)), fetch(u, init));
  const p = await startPreview({ siteUrl: site, agentDir: dir, fetchImpl, ia: async (m) => (perguntas.push(m), { frase: "qual o horario" }) });
  t.after(() => p.stop());
  const home = await fetch(p.url);
  const html = await home.text();
  assert.match(html, /<script type="module" src="\/__agente\/widget\.js"><\/script><\/body>/);
  assert.doesNotMatch(html, /Content-Security-Policy/i);
  assert.equal(home.headers.get("content-security-policy"), null);
  assert.equal(home.headers.get("set-cookie"), null);
  assert.equal(await (await fetch(`${p.url}__agente/widget.js`)).text(), "console.log('widget');");
  assert.equal((await fetch(`${p.url}__agente/servidor.js`)).status, 404);
  assert.equal((await fetch(`${p.url}__agente/../../etc/passwd`)).status, 404);
  assert.equal(await (await fetch(`${p.url}logo.svg`)).text(), "<svg/>");
  assert.equal((await fetch(`${p.url}contato`, { method: "POST", body: "x" })).status, 405);
  const ia = await (await fetch(`${p.url}api/ia`, { method: "POST", body: JSON.stringify({ mensagem: "abre cedo?" }) })).json();
  assert.deepEqual(ia, { frase: "qual o horario" });
  assert.deepEqual(perguntas, ["abre cedo?"]);
  // Caminho cru (sem a normalização do fetch): a prévia nunca busca outro site.
  const { hostname, port } = new URL(p.url);
  const cru = (path) =>
    new Promise((ok, no) => {
      const r = httpRequest({ hostname, port, path }, (res) => (res.resume(), res.on("end", () => ok(res.statusCode))));
      r.on("error", no);
      r.end();
    });
  for (const path of ["/.//evil.example/a", "//evil.example/x", "/..//evil.example/b"]) await cru(path);
  const origem = new URL(site).origin;
  assert.ok(pedidos.length > 0);
  assert.ok(pedidos.every((u) => new URL(u).origin === origem), `a prévia só busca o próprio site: ${pedidos.join(", ")}`);
});

// ---------- de ponta a ponta pelo instalador (API da janela) ----------
async function startGui(t, args) {
  const port = 47100 + Math.floor(Math.random() * 700);
  const logs = [];
  const origLog = console.log;
  console.log = (...a) => logs.push(a.join(" "));
  t.after(() => (console.log = origLog));
  const done = main(["instalador", ...args, "--sem-navegador", "--porta", String(port), "--pausa", "0"]);
  const url = await until(async () => logs.join("\n").match(/http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]+/)?.[0]);
  const { origin, searchParams } = new URL(url);
  const token = searchParams.get("t");
  const headers = { "content-type": "application/json", "x-instalador": token };
  const call = async (method, path, data) => {
    const res = await fetch(origin + path, { method, headers, body: method === "POST" ? JSON.stringify(data || {}) : undefined });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.erro || `HTTP ${res.status}`);
    return body;
  };
  const task = () =>
    until(async () => {
      const { tarefa } = await call("GET", "/api/tarefa");
      if (tarefa?.status === "erro") throw new Error(tarefa.erro);
      return tarefa?.status === "ok" ? tarefa.resultado : null;
    });
  let encerrado = false;
  const sair = async () => {
    encerrado = true;
    await call("POST", "/api/sair");
    return done;
  };
  // Teste que falhou no meio: fecha o instalador mesmo assim (senão o processo não termina).
  t.after(async () => {
    if (encerrado) return;
    await call("POST", "/api/sair").catch(() => {});
    await Promise.race([done.catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
  });
  return { origin, token, call, task, sair, logs };
}

async function conectarTudo(gui, cf) {
  // OpenRouter em 1 clique: a janela pede, o "navegador" (este teste) volta com o código.
  const { conexao } = await gui.call("POST", "/api/ia/openrouter");
  assert.equal(conexao.status, "esperando");
  const auth = new URL(conexao.url);
  const volta = await fetch(`${auth.searchParams.get("callback_url")}?code=codigo-bom&state=${auth.searchParams.get("state")}`);
  assert.equal(volta.status, 200);
  const ia = await until(async () => {
    const r = await gui.call("GET", "/api/ia");
    return r.conexao?.status === "ok" ? r : null;
  });
  assert.equal(ia.cofre.ia.provedor, "openrouter");
  assert.equal(ia.cofre.ia.modelo, "meta-llama/llama-3.3-70b-instruct:free");
  assert.doesNotMatch(JSON.stringify(ia), new RegExp(OR_KEY), "a janela nunca recebe a chave inteira");
  const c = await gui.call("POST", "/api/cloudflare", { token: "cf-token-de-teste-1234567890" });
  assert.equal(c.conta, "Conta da Loja");
  assert.ok(c.cofre.cloudflare);
  return ia;
}

test("instalador, site já publicado: endereço -> leitura -> IA 1 clique -> Cloudflare -> linha, plugin, prévia, verificação", async (t) => {
  await forget("tudo");
  const cf = fakeCloudflare();
  const or = fakeOpenRouter({ frase: "qual o horario" });
  stubFetch(t, { cf, or });
  const site = await liveSiteFromExample(t);
  const base = await tmp(t);
  const gui = await startGui(t, [base]);
  await conectarTudo(gui, cf);
  await assert.rejects(gui.call("POST", "/api/url", { url: site }), /autorização/);
  const { info } = await gui.call("POST", "/api/url", { url: site, autorizado: true });
  assert.equal(info.modo, "url");
  assert.equal(info.site, site);
  assert.equal((await gui.call("GET", "/api/estado")).modo, "url");
  await gui.call("POST", "/api/analisar");
  const a = await gui.task();
  assert.equal(a.modo, "url");
  assert.ok(a.resumo.paginas >= 4, `páginas lidas: ${a.resumo.paginas}`);
  assert.ok(a.recursos.length > 0);
  await gui.call("POST", "/api/instalar", { recursos: { catalogo: true }, agente: { nome: "Aurora", cor: "#0f766e" }, ia: { usar: true, melhorar: false } });
  const inst = await gui.task();
  const nome = `agente-${new URL(site).host.replace(/[^a-z0-9]+/gi, "-")}`;
  assert.equal(inst.servico, `https://${nome}.conta-da-loja.workers.dev`);
  assert.ok(inst.geral >= 70, `acerto ${inst.geral}`);
  assert.match(inst.kit.tags, /workers\.dev\/agente\/widget\.js/);
  const dir = join(info.pasta, "agente-servico", "agente");
  const agente = JSON.parse(await readFile(join(dir, "conhecimento", "agente.json"), "utf8"));
  assert.equal(agente.nome, "Aurora");
  assert.equal(agente.endpoint, "", "o agente roda no navegador");
  assert.deepEqual(agente.ia, { endpoint: "../api/ia" });
  const s = cf.scripts[nome];
  const b = Object.fromEntries(s.metadata.bindings.map((x) => [x.name, x]));
  assert.equal(b.IA_CHAVE.text, OR_KEY);
  assert.equal(b.IA_PROVEDOR.text, "openrouter");
  assert.equal(b.MODO.text, "completo");
  assert.equal(b.ORIGENS.text, site, "o site (127.0.0.1) não ganha variante www");
  for (const f of ["/agente/widget.js", "/agente/widget.css", "/agente/nucleo/agent.js", "/agente/nucleo/ia.js", "/agente/conhecimento/agente.json"]) assert.ok(cf.manifest[f], `publicou ${f}`);
  assert.equal(Object.keys(cf.manifest).some((f) => /servidor\.js$/.test(f)), false);
  // Colocar no site.
  const k = await gui.call("GET", "/api/colocar");
  assert.equal(k.plataforma, "html");
  assert.match(k.loader, /createElement\('script'\)/);
  const zip = await fetch(`${gui.origin}/api/arquivo/agente-wordpress.zip?t=${gui.token}`);
  assert.equal(zip.headers.get("content-type"), "application/zip");
  assert.equal((await fetch(`${gui.origin}/api/arquivo/agente-wordpress.zip?t=errado`)).status, 403);
  const buf = Buffer.from(await zip.arrayBuffer());
  const php = inflateRawSync(buf.subarray(30 + buf.readUInt16LE(26), 30 + buf.readUInt16LE(26) + buf.readUInt32LE(18))).toString();
  assert.ok(php.includes(`${inst.servico}/agente/`));
  assert.match(await readFile(join(info.pasta, "agente-gerador", "COMO-COLOCAR-NO-SITE.txt"), "utf8"), /Google Tag Manager/);
  const v = await gui.call("POST", "/api/verificar");
  assert.equal(v.servico, true);
  assert.equal(v.pagina, false, "a linha ainda não foi colada");
  const { url: previa } = await gui.call("POST", "/api/previa");
  assert.match(await (await fetch(previa)).text(), /__agente\/widget\.js/);
  // Conversa de teste com a IA do cofre (como o serviço faria).
  const r = await gui.call("POST", "/api/testar", { mensagem: "blorf zank quimbo?" });
  assert.equal(r.interpretado, "qual o horario");
  // Remover: apaga o serviço.
  await gui.call("POST", "/api/servico/remover");
  assert.ok(cf.deletes.includes(nome));
  assert.equal(await gui.sair(), 0);
});

// Site "no ar" (servidor local) com as páginas do café de exemplo.
async function liveSiteFromExample(t) {
  const dir = await tmp(t, "ag-live-");
  await cp(EXAMPLE, dir, { recursive: true, filter: (src) => !/[\\/](agente|agente-gerador)([\\/]|$)/.test(src.slice(EXAMPLE.length)) });
  const types = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml" };
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    const rel = path === "/" ? "index.html" : path.slice(1);
    try {
      const body = await readFile(join(dir, rel));
      res.setHeader("content-type", types[rel.slice(rel.lastIndexOf("."))] || "text/plain");
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("não");
    }
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test("instalador, pasta do site: IA conectada vira segredo do serviço e o widget aponta para ele", async (t) => {
  await forget("tudo");
  const cf = fakeCloudflare({ subdominio: "loja-sub" });
  const or = fakeOpenRouter({ frase: "qual o horario" });
  stubFetch(t, { cf, or });
  const site = await exampleCopy(t);
  const gui = await startGui(t, [site]);
  await conectarTudo(gui, cf);
  await gui.call("POST", "/api/analisar");
  await gui.task();
  await gui.call("POST", "/api/instalar", { inserir: true, ia: { usar: true, melhorar: true, publicar: true, site: "cafe-aurora.com.br" } });
  const inst = await gui.task();
  assert.ok(inst.ia?.url, JSON.stringify(inst.ia));
  const nome = inst.ia.url.match(/https:\/\/([^.]+)\./)[1];
  const agente = JSON.parse(await readFile(join(site, "agente", "conhecimento", "agente.json"), "utf8"));
  assert.deepEqual(agente.ia, { endpoint: `${inst.ia.url}/api/ia` });
  const b = Object.fromEntries(cf.scripts[nome].metadata.bindings.map((x) => [x.name, x]));
  assert.equal(b.ORIGENS.text, "https://cafe-aurora.com.br,https://www.cafe-aurora.com.br");
  assert.equal(b.ORIGENS_LOCAIS.text, "1");
  assert.equal(b.MODO.text, "ia");
  assert.equal(b.IA_CHAVE.type, "secret_text");
  assert.equal(cf.scripts[nome].metadata.assets, undefined, "o agente fica no site; o serviço só tem a IA");
  assert.ok(or.calls.some((c) => c.url.endsWith("/chat/completions")), "melhorou a base com a IA conectada");
  assert.ok(inst.resumo.some((l) => /segredo/.test(l)));
  const cfg = JSON.parse(await readFile(join(site, "agente-gerador", "config.json"), "utf8"));
  assert.equal(cfg.siteUrl, "https://cafe-aurora.com.br");
  assert.equal(cfg.servico.url, inst.ia.url);
  // A chave nunca vai para o projeto.
  const tudo = await Promise.all(["agente/conhecimento/agente.json", "agente-gerador/config.json", "agente-gerador/RESUMO.txt"].map((f) => readFile(join(site, f), "utf8")));
  assert.equal(tudo.some((x) => x.includes(OR_KEY)), false);
  // Desinstalar com o serviço junto.
  const plano = await gui.call("GET", "/api/desinstalar");
  assert.equal(plano.servico.url, inst.ia.url);
  await gui.call("POST", "/api/desinstalar", { apagarServico: true });
  const des = await gui.task();
  assert.ok(des.resumo.some((l) => /Cloudflare/.test(l)));
  assert.ok(cf.deletes.includes(nome));
  assert.equal(await gui.sair(), 0);
});

test("CLI: ia (Gemini por variável) e publicar (pasta de projeto, com --site e --remover)", async (t) => {
  await forget("tudo");
  const cf = fakeCloudflare({ subdominio: "loja-sub" });
  const gemini = async (url, init) => (/models\?/.test(url) ? json({ models: [{ name: "models/gemini-2.5-flash-lite", supportedGenerationMethods: ["generateContent"] }] }) : json({}, 404));
  stubFetch(t, { cf, gemini });
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(" "));
  t.after(() => (console.log = orig));
  process.env.GEMINI_API_KEY = "AIzaChaveDoAmbiente1234567890";
  t.after(() => delete process.env.GEMINI_API_KEY);
  assert.equal(await main(["ia", "--provedor", "gemini"]), 0);
  assert.ok(logs.some((l) => /Chave aceita pelo Google/.test(l)));
  assert.doesNotMatch(logs.join("\n"), /AIzaChaveDoAmbiente1234567890/);
  const site = await exampleCopy(t);
  assert.equal(await main(["criar", site]), 0);
  assert.equal(await main(["publicar", site, "--token", "cf-token-de-teste-1234567890", "--site", "https://cafe.com.br"]), 0);
  const agente = JSON.parse(await readFile(join(site, "agente", "conhecimento", "agente.json"), "utf8"));
  assert.match(agente.ia.endpoint, /^https:\/\/agente-cafe-com-br\.loja-sub\.workers\.dev\/api\/ia$/);
  assert.ok(logs.some((l) => /segredo na Cloudflare/.test(l)));
  assert.equal(await main(["ia"]), 0);
  assert.ok(logs.some((l) => /Serviço: https:\/\/agente-cafe-com-br/.test(l)));
  assert.equal(await main(["publicar", site, "--remover"]), 0);
  assert.ok(cf.deletes.includes("agente-cafe-com-br"));
  assert.equal(JSON.parse(await readFile(join(site, "agente", "conhecimento", "agente.json"), "utf8")).ia, null);
  assert.equal(await main(["ia", "--esquecer=tudo"]), 0);
  assert.deepEqual(await readVault(), {});
});
