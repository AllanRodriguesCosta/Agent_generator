// Versão 0.11/0.12: publica o "serviço do agente" na conta GRATUITA da Cloudflare da própria pessoa,
// pela API (sem wrangler, sem git e sem novo deploy do site).
// - Modo "ia" (site com a pasta do agente): o serviço só guarda a chave da IA como segredo e
//   reescreve as frases que o agente do navegador não entendeu. Nada de variável no Render ou
//   Action no GitHub.
// - Modo "completo" (site já publicado, 0.12): o serviço também entrega o widget, o núcleo e a base
//   como arquivos estáticos (grátis e sem limite diário). O site só ganha uma linha.
// A chave de publicação é um token da Cloudflare criado pela pessoa num link que já marca as
// permissões (Workers e KV); o instalador guarda no cofre local (src/ia/cofre.js).
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep, extname } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { vocabulary } from "../agent/ia.js";

export const CF_API = "https://api.cloudflare.com/client/v4";
export const COMPAT_DATE = "2025-09-01";
const ROOT = new URL("../../", import.meta.url);

/** Link que abre a criação do token com as permissões certas já marcadas (a pessoa só confirma). */
export function tokenTemplateUrl(nome = "Agent Generator") {
  const permissoes = [
    { key: "workers_scripts", type: "edit" },
    { key: "workers_kv_storage", type: "edit" },
    { key: "account_settings", type: "read" },
  ];
  const q = (v) => encodeURIComponent(v).replace(/\*/g, "%2A");
  return `https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=${q(JSON.stringify(permissoes))}&accountId=${q("*")}&zoneId=all&name=${q(nome)}`;
}
export const SIGNUP_URL = "https://dash.cloudflare.com/sign-up/workers-and-pages";

export class CloudflareError extends Error {
  constructor(message, { status = 0, codes = [], detalhe = "" } = {}) {
    super(message);
    this.status = status;
    this.codes = codes;
    this.detalhe = detalhe;
  }
}

function explain(status, errors = []) {
  const codes = errors.map((e) => e?.code);
  const detalhe = errors.map((e) => e?.message).filter(Boolean).join("; ");
  if (status === 401 || codes.includes(10000) || codes.includes(9109) || codes.includes(6003))
    return "A Cloudflare não aceitou a chave de publicação. Crie outra pelo botão Criar chave de publicação e cole aqui.";
  if (status === 403) return "A chave de publicação não tem permissão para isso. Crie pelo botão Criar chave de publicação (ele já marca Workers e KV).";
  if (status === 429) return "A Cloudflare pediu para esperar um pouco. Tente de novo em 1 minuto.";
  if (status === 0) return "Não consegui falar com a Cloudflare. Confira a internet (ou um bloqueio de rede da empresa).";
  if (status >= 500) return `A Cloudflare está com instabilidade (${status}). Tente de novo em instantes.`;
  return `A Cloudflare recusou o pedido (${status}${detalhe ? `: ${detalhe}` : ""}).`;
}

/** Cliente mínimo da API: call(método, caminho, { json, form, query, auth, raw }). */
export function cfClient(token, { fetchImpl = fetch } = {}) {
  return async function call(method, path, { json, form, query, auth = token, raw = false } = {}) {
    const url = new URL(`${CF_API}${path}`);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    let res;
    try {
      res = await fetchImpl(url, {
        method,
        headers: { authorization: `Bearer ${auth}`, accept: "application/json", ...(json ? { "content-type": "application/json" } : {}) },
        body: json ? JSON.stringify(json) : form,
      });
    } catch {
      throw new CloudflareError(explain(0));
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok || data?.success === false) {
      const errors = Array.isArray(data?.errors) ? data.errors : [];
      throw new CloudflareError(explain(res.status, errors), { status: res.status, codes: errors.map((e) => e?.code), detalhe: errors.map((e) => e?.message).join("; ") });
    }
    return raw ? data : data?.result ?? data;
  };
}

const slug = (v, max = 40) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");

/** Nome do serviço: vira parte do endereço (agente-minhaloja-com-br.SUB.workers.dev). */
export function serviceName(site) {
  let host = String(site || "");
  try {
    host = new URL(/^https?:\/\//i.test(host) ? host : `https://${host}`).host;
  } catch {
    /* nome de pasta */
  }
  return `agente-${slug(host.replace(/^www\./, ""), 46) || "site"}`;
}

/** Confere o token, escolhe a conta e lê o subdomínio workers.dev (pode não existir ainda). */
export async function connectCloudflare(token, { fetchImpl = fetch, contaId = "" } = {}) {
  const t = String(token || "").trim();
  if (t.length < 20 || /\s/.test(t)) throw new CloudflareError("Isso não parece uma chave de publicação da Cloudflare. Copie o token inteiro que aparece depois de Create Token.");
  const call = cfClient(t, { fetchImpl });
  const v = await call("GET", "/user/tokens/verify");
  if (v?.status && v.status !== "active") throw new CloudflareError("Essa chave de publicação está desativada ou expirou. Crie outra pelo botão.");
  const contas = await call("GET", "/accounts", { query: { per_page: 50 } });
  if (!Array.isArray(contas) || !contas.length) throw new CloudflareError("A chave não dá acesso a nenhuma conta. Crie de novo pelo botão Criar chave de publicação.");
  const conta = contas.find((c) => c.id === contaId) || contas[0];
  let subdominio = "";
  try {
    subdominio = (await call("GET", `/accounts/${conta.id}/workers/subdomain`))?.subdomain || "";
  } catch (error) {
    if (error.status === 401 || error.status === 403) throw error;
    /* conta nova: ainda sem subdomínio workers.dev (criado na publicação) */
  }
  return { token: t, contaId: conta.id, conta: conta.name || "", contas: contas.map((c) => ({ id: c.id, nome: c.name || c.id })), subdominio };
}

/** Cria o subdomínio workers.dev da conta (contas novas não têm). Tenta variações se estiver em uso. */
export async function ensureSubdomain(call, contaId, sugestao) {
  const base = slug(sugestao, 30) || "agente";
  let last;
  for (let i = 0; i < 4; i++) {
    const nome = i ? `${base}-${randomBytes(2).toString("hex")}` : base;
    try {
      const r = await call("PUT", `/accounts/${contaId}/workers/subdomain`, { json: { subdomain: nome } });
      return r?.subdomain || nome;
    } catch (error) {
      last = error;
      if (error.status === 401 || error.status === 403 || error.status === 0) throw error;
    }
  }
  throw last;
}

async function ensureKv(call, contaId, title) {
  const lista = await call("GET", `/accounts/${contaId}/storage/kv/namespaces`, { query: { per_page: 100 } });
  const achado = (Array.isArray(lista) ? lista : []).find((n) => n.title === title);
  if (achado) return achado.id;
  return (await call("POST", `/accounts/${contaId}/storage/kv/namespaces`, { json: { title } })).id;
}

/** Módulos do Worker: o serviço, o núcleo de IA e o vocabulário do site (só o que a IA precisa). */
export async function workerModules(knowledge) {
  const read = (p) => readFile(new URL(p, ROOT), "utf8");
  return {
    "worker.js": await read("templates/worker.js"),
    "nucleo/ia.js": await read("src/agent/ia.js"),
    "nucleo/privacy.js": await read("src/agent/privacy.js"),
    "vocabulario.js": `// Gerado pelo Agent Generator: vocabulário do site para a IA (sem dados de pessoas).\nexport default ${JSON.stringify(vocabulary(knowledge))};\n`,
  };
}

const TYPES = { ".js": "application/javascript; charset=utf-8", ".mjs": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };

/** Arquivos estáticos do modo completo: a pasta do agente vira /agente/... no serviço. */
export async function agentAssets(agentDir) {
  const out = {};
  async function walk(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.name.startsWith(".")) continue;
      if (e.isDirectory()) await walk(full);
      else {
        const rel = relative(agentDir, full).split(sep).join("/");
        // Nunca publica o que é do servidor (modo servidor) ou o registro local de faltas.
        if (/^servidor\.js$|faltas|LEIA-ME/i.test(rel)) continue;
        if (!TYPES[extname(rel).toLowerCase()]) continue;
        out[`/agente/${rel}`] = { body: await readFile(full), type: TYPES[extname(rel).toLowerCase()] };
      }
    }
  }
  await walk(agentDir);
  return out;
}

// Cabeçalhos dos arquivos estáticos: o widget é carregado por outro site (o seu), então precisa de
// CORS. A base é pública (veio das páginas públicas do site).
export const ASSET_HEADERS = "/agente/*\n  Access-Control-Allow-Origin: *\n  X-Content-Type-Options: nosniff\n";

export function assetManifest(assets) {
  const manifest = {};
  const byHash = {};
  for (const [path, { body, type }] of Object.entries(assets)) {
    const b64 = Buffer.from(body).toString("base64");
    const hash = createHash("sha256").update(b64 + extname(path).slice(1)).digest("hex").slice(0, 32);
    manifest[path] = { hash, size: Buffer.byteLength(body) };
    byHash[hash] = { b64, type };
  }
  return { manifest, byHash };
}

async function uploadAssets(call, contaId, nome, assets, log) {
  const { manifest, byHash } = assetManifest(assets);
  const sessao = await call("POST", `/accounts/${contaId}/workers/scripts/${nome}/assets-upload-session`, { json: { manifest } });
  let jwt = sessao?.jwt;
  const buckets = Array.isArray(sessao?.buckets) ? sessao.buckets : [];
  let enviados = 0;
  for (const bucket of buckets) {
    const form = new FormData();
    for (const hash of bucket) {
      const f = byHash[hash];
      if (!f) throw new CloudflareError(`A Cloudflare pediu um arquivo desconhecido (${hash}).`);
      form.append(hash, new File([f.b64], hash, { type: f.type }));
    }
    const r = await call("POST", `/accounts/${contaId}/workers/assets/upload`, { query: { base64: "true" }, form, auth: sessao.jwt });
    if (r?.jwt) jwt = r.jwt;
    enviados += bucket.length;
  }
  log(enviados ? `${enviados} arquivo(s) do agente enviados (os iguais aos da última vez foram reaproveitados).` : "Arquivos do agente iguais aos publicados: nada a enviar.");
  return jwt;
}

export async function checkHealth(url, { fetchImpl = fetch, tries = 6, waitMs = 2500 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetchImpl(`${url}/saude`, { headers: { accept: "application/json" } });
      if (r.ok) return await r.json();
    } catch {
      /* subdomínio novo pode levar alguns minutos para responder */
    }
    if (i < tries - 1) await new Promise((ok) => setTimeout(ok, waitMs));
  }
  return null;
}

/**
 * Publica (ou atualiza) o serviço. opcoes:
 *   token, contaId, subdominio (vazio = cria), conta (nome, sugestão do subdomínio), nome (do serviço)
 *   knowledge (base: vira o vocabulário da IA), assets (modo completo: agentAssets), site, origens[]
 *   locais: true libera também http://localhost e 127.0.0.1 (testes no computador)
 *   ia: { provedor, modelo, baseUrl, porMinuto, porDia } (ou null = sem IA)
 *   chave: string (grava o segredo), undefined (mantém o da última publicação) ou "" (remove)
 *   faltas: true (registro das frases não entendidas no KV), versao
 * Devolve { url, nome, subdominio, modo, kvId, saude }.
 */
export async function publishService(o, { fetchImpl = fetch, log = () => {}, healthTries = 6, healthWaitMs = 2500 } = {}) {
  const call = cfClient(o.token, { fetchImpl });
  const nome = o.nome || serviceName(o.site);
  let subdominio = o.subdominio;
  if (!subdominio) {
    log("Criando o seu endereço gratuito na Cloudflare (workers.dev)...");
    subdominio = await ensureSubdomain(call, o.contaId, o.conta || nome);
  }
  let kvId = "";
  if (o.faltas !== false) {
    try {
      kvId = await ensureKv(call, o.contaId, `${nome}-faltas`);
    } catch (error) {
      log(`Sem registro das frases não entendidas (KV): ${error.message}`);
    }
  }
  const completo = Boolean(o.assets && Object.keys(o.assets).length);
  let assetsJwt = "";
  if (completo) {
    log("Enviando o widget e a base de conhecimento...");
    assetsJwt = await uploadAssets(call, o.contaId, nome, o.assets, log);
  }
  const ia = o.ia?.provedor ? o.ia : null;
  const texto = (name, text) => ({ type: "plain_text", name, text: String(text ?? "") });
  const bindings = [
    texto("SITE", o.site || ""),
    texto("ORIGENS", (o.origens || []).join(",")),
    // Sites com a pasta do agente: libera também http://localhost para testar no computador.
    ...(o.locais ? [texto("ORIGENS_LOCAIS", "1")] : []),
    texto("MODO", completo ? "completo" : "ia"),
    texto("VERSAO", o.versao || ""),
    ...(ia
      ? [
          texto("IA_PROVEDOR", ia.provedor),
          ...(ia.modelo ? [texto("IA_MODELO", ia.modelo)] : []),
          ...(ia.baseUrl ? [texto("IA_URL", ia.baseUrl)] : []),
          ...(ia.porMinuto ? [texto("IA_POR_MINUTO", ia.porMinuto)] : []),
          ...(ia.porDia ? [texto("IA_POR_DIA", ia.porDia)] : []),
          // Segredo: novo, mantido da publicação anterior (inherit) ou nenhum.
          ...(o.chave ? [{ type: "secret_text", name: "IA_CHAVE", text: o.chave }] : o.chave === undefined ? [{ type: "inherit", name: "IA_CHAVE" }] : []),
        ]
      : []),
    ...(kvId ? [{ type: "kv_namespace", name: "FALTAS", namespace_id: kvId }] : []),
  ];
  const metadata = {
    main_module: "worker.js",
    compatibility_date: COMPAT_DATE,
    bindings,
    tags: ["agent-generator"],
    ...(completo ? { assets: { jwt: assetsJwt, config: { _headers: ASSET_HEADERS, html_handling: "none", not_found_handling: "none" } } } : {}),
  };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  for (const [name, code] of Object.entries(await workerModules(o.knowledge || {}))) form.append(name, new File([code], name, { type: "application/javascript+module" }));
  log("Publicando o serviço do agente...");
  await call("PUT", `/accounts/${o.contaId}/workers/scripts/${nome}`, { form });
  await call("POST", `/accounts/${o.contaId}/workers/scripts/${nome}/subdomain`, { json: { enabled: true, previews_enabled: false } });
  const url = `https://${nome}.${subdominio}.workers.dev`;
  log(`Serviço no ar em ${url}. Conferindo...`);
  const saude = healthTries ? await checkHealth(url, { fetchImpl, tries: healthTries, waitMs: healthWaitMs }) : null;
  if (!saude) log("O endereço ainda não respondeu. Em conta nova, a Cloudflare pode levar alguns minutos para ativar o workers.dev.");
  return { url, nome, subdominio, modo: completo ? "completo" : "ia", kvId, saude };
}

/** Desinstalar: apaga o serviço e o registro de frases. */
export async function removeService({ token, contaId, nome, kvId }, { fetchImpl = fetch } = {}) {
  const call = cfClient(token, { fetchImpl });
  try {
    await call("DELETE", `/accounts/${contaId}/workers/scripts/${nome}`, { query: { force: "true" } });
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  if (kvId) await call("DELETE", `/accounts/${contaId}/storage/kv/namespaces/${kvId}`).catch(() => {});
  return true;
}

/** Frases não entendidas guardadas pelo serviço (para o comando aprender). */
export async function readServiceMisses({ token, contaId, kvId }, { fetchImpl = fetch, max = 5000 } = {}) {
  if (!kvId) return [];
  const call = cfClient(token, { fetchImpl });
  const out = [];
  let cursor = "";
  for (let i = 0; i < 10 && out.length < max; i++) {
    const data = await call("GET", `/accounts/${contaId}/storage/kv/namespaces/${kvId}/keys`, { query: { prefix: "f:", limit: 1000, cursor }, raw: true });
    for (const k of data?.result || []) if (typeof k?.metadata?.f === "string") out.push({ frase: k.metadata.f, em: k.name.split(":").slice(1, -1).join(":") });
    cursor = data?.result_info?.cursor || "";
    if (!cursor) break;
  }
  return out.slice(0, max);
}
