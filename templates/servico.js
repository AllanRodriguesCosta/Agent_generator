// Serviço do agente (versão 0.6): roda AO LADO de um site já publicado, sem mexer no código dele.
// O site só ganha duas linhas (o CSS e o script do widget). Sem dependências: Node 20+.
//   node servico.js            -> http://localhost:8787
// Variáveis (todas opcionais):
//   PORT            porta (padrão 8787; Render, Railway e Azure definem sozinhos)
//   ORIGENS         sites que podem usar o agente, separados por vírgula (ex.: https://minhaloja.com.br).
//                   Vazio = só o SITE_URL do config. Use * apenas em testes.
//   SITE_URL        endereço do site (lido de servico.config.json se não vier no ambiente)
//   IA_PROVEDOR     gemini | openai (vazio = sem IA)   IA_CHAVE, IA_MODELO, IA_URL, IA_RESPOSTA_LIVRE
//   CATALOGO_MIN    de quantos em quantos minutos o catálogo é relido da API do site (padrão 30; 0 desliga)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { createChatHandler, loadKnowledgeFromDisk } from "./agente/servidor.js";
import { createAgent } from "./agente/nucleo/agent.js";
import { iaConfig, withIa } from "./agente/nucleo/ia.js";
import { mapItems } from "./agente/nucleo/catalog-map.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const STATIC = join(HERE, "agente");
const TYPES = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/plain; charset=utf-8" };

const listFrom = (data) => (Array.isArray(data) ? data : ["data", "items", "itens", "produtos", "products", "results"].map((k) => data?.[k]).find(Array.isArray) || []);

export async function createService({ env = process.env, fetchImpl = fetch, now } = {}) {
  let config = {};
  try {
    config = JSON.parse(await readFile(join(HERE, "servico.config.json"), "utf8"));
  } catch {
    /* sem config: só variáveis de ambiente */
  }
  const site = String(env.SITE_URL || config.site || "").replace(/\/+$/, "");
  const origins = String(env.ORIGENS || site)
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  const ia = iaConfig(env);
  const holder = { atual: null };
  const build = (raw) => withIa(createAgent(raw), ia, { fetchImpl, now });
  let raw = await loadKnowledgeFromDisk(new URL("./agente/conhecimento/", import.meta.url));
  holder.atual = build(raw);
  const chat = await createChatHandler({ agente: holder, faltas: new URL("./faltas.jsonl", import.meta.url), env });

  // Catálogo vivo: relê a API pública do site (catalogo.url) e troca a base sem reiniciar.
  let catalogoEm = null;
  async function refreshCatalog() {
    const url = raw.catalogo?.url;
    if (!url || !site) return false;
    try {
      const res = await fetchImpl(new URL(url, `${site}/`), { headers: { accept: "application/json", "user-agent": "agent-generator-servico/0.6" } });
      const mapped = res.ok ? mapItems(listFrom(await res.json()), url, raw.catalogo.campos || {}, 1) : null;
      if (!mapped) return false;
      raw = { ...raw, catalogo: { ...raw.catalogo, itens: mapped.itens } };
      holder.atual = build(raw);
      catalogoEm = new Date().toISOString();
      return true;
    } catch {
      return false;
    }
  }
  const minutes = Number(env.CATALOGO_MIN ?? 30);
  let timer = null;
  if (minutes > 0 && raw.catalogo?.url && site) {
    await refreshCatalog();
    timer = globalThis.setInterval(refreshCatalog, minutes * 60000);
    timer.unref?.();
  }

  // Limite simples por IP: 40 mensagens por minuto.
  const hits = new Map();
  const tooMany = (ip) => {
    const t = Date.now();
    const list = (hits.get(ip) || []).filter((x) => t - x < 60000);
    list.push(t);
    hits.set(ip, list);
    if (hits.size > 5000) hits.clear();
    return list.length > 40;
  };
  const cors = (req, res) => {
    const origin = req.headers.origin;
    if (origin && (origins.includes("*") || origins.includes(origin))) {
      res.setHeader("access-control-allow-origin", origins.includes("*") ? "*" : origin);
      res.setHeader("vary", "Origin");
      res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type");
      res.setHeader("access-control-max-age", "600");
      return true;
    }
    return !origin;
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://servico");
    const allowed = cors(req, res);
    res.setHeader("x-content-type-options", "nosniff");
    if (req.method === "OPTIONS") {
      res.statusCode = allowed ? 204 : 403;
      return res.end();
    }
    if (url.pathname === "/saude") {
      res.setHeader("content-type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ ok: true, ia: holder.atual.ia?.provedor || "nenhuma", itens: raw.catalogo?.itens?.length || 0, catalogoAtualizadoEm: catalogoEm }));
    }
    if (url.pathname === "/api/agente" && req.method === "POST") {
      if (!allowed) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ erro: "Origem não autorizada. Configure ORIGENS." }));
      }
      if (tooMany(req.socket.remoteAddress || "?")) {
        res.statusCode = 429;
        return res.end(JSON.stringify({ erro: "Muitas mensagens. Tente em instantes." }));
      }
      return chat(req, res);
    }
    if (req.method === "GET" && url.pathname.startsWith("/agente/")) {
      const file = normalize(join(STATIC, decodeURIComponent(url.pathname.slice("/agente/".length))));
      if (!file.startsWith(STATIC + sep) || /servidor\.js$|faltas/.test(file)) {
        res.statusCode = 404;
        return res.end();
      }
      try {
        const body = await readFile(file);
        res.setHeader("content-type", TYPES[extname(file)] || "application/octet-stream");
        res.setHeader("cache-control", /conhecimento/.test(file) ? "no-cache" : "public, max-age=300");
        return res.end(body);
      } catch {
        res.statusCode = 404;
        return res.end();
      }
    }
    if (req.method === "GET" && url.pathname === "/") {
      res.setHeader("content-type", "text/plain; charset=utf-8");
      const host = `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
      return res.end(`Serviço do agente no ar.\n\nCole no site, antes de </body>:\n<link rel="stylesheet" href="${host}/agente/widget.css">\n<script type="module" src="${host}/agente/widget.js"></script>\n\nSites autorizados: ${origins.join(", ") || "(nenhum: configure ORIGENS)"}\nIA: ${holder.atual.ia?.provedor || "nenhuma"}\n`);
    }
    res.statusCode = 404;
    res.end();
  });
  server.on("close", () => timer && globalThis.clearInterval(timer));
  return { server, refreshCatalog, origins, holder };
}

const isMain = (() => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();
if (isMain) {
  const { server, origins } = await createService();
  const port = Number(process.env.PORT) || 8787;
  server.listen(port, () => console.log(`Agente em http://localhost:${port} (sites autorizados: ${origins.join(", ") || "nenhum"})`));
}
