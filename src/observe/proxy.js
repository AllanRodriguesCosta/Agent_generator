// Proxy local da observação e do treino (versão 0.3). Fica na frente do site que está rodando na
// máquina (http://localhost:3000, por exemplo): repassa tudo, injeta o gravador nas páginas HTML
// e anota as chamadas. Só aceita destino local, escuta só em 127.0.0.1 e não guarda cookies.
import { createServer, request as httpRequest } from "node:http";
import { readFile } from "node:fs/promises";
import { exchange, LIMITS } from "./record.js";

const CLIENT = new URL("./client/", import.meta.url);
const PREFIX = "/__agente-gerador/";
const HOP = new Set(["connection", "keep-alive", "proxy-connection", "transfer-encoding", "upgrade", "te", "trailer"]);

export function localTarget(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Endereço inválido: ${value}. Use algo como http://localhost:3000`);
  }
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Por segurança, a observação só funciona com o site rodando na sua máquina (http://localhost:PORTA).");
  return url;
}

// Insere as tags antes de </head> (scripts de configuração) e de </body> (gravador e widget).
export function injectHtml(html, { head = "", body = "" }) {
  let out = html;
  if (head) out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${head}</head>`) : head + out;
  if (body) out = /<\/body>(?![\s\S]*<\/body>)/i.test(out) ? out.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${body}</body>`) : out + body;
  return out;
}

const readBody = (stream, limit = 2_000_000) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    stream.on("data", (c) => {
      size += c.length;
      if (size <= limit) chunks.push(c);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });

/**
 * target: URL do site local. extras: { head, body } a injetar em cada HTML.
 * routes: { "nome": async (req, body) => ({ status, json }) } atendidas em /__agente-gerador/nome.
 * Devolve { server, events, exchanges }.
 */
export function createObserver({ target, inject = { head: "", body: "" }, routes = {}, onEnd = () => {} }) {
  const base = localTarget(target);
  const events = [];
  const exchanges = [];
  const push = (list, item) => list.length < LIMITS.eventos && list.push(item);
  let lastPage = "";

  const server = createServer(async (req, res) => {
    try {
      if (req.url.startsWith(PREFIX)) return await internal(req, res);
      const requestBody = ["GET", "HEAD"].includes(req.method) ? Buffer.alloc(0) : await readBody(req);
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !HOP.has(k)));
      headers.host = base.host;
      headers["accept-encoding"] = "identity"; // para conseguir injetar no HTML
      if (headers.origin) headers.origin = base.origin;
      if (headers.referer) headers.referer = headers.referer.replace(/^https?:\/\/[^/]+/, base.origin);
      const upstream = await new Promise((resolve, reject) => {
        const r = httpRequest({ hostname: base.hostname.replace(/^\[|\]$/g, ""), port: base.port || 80, method: req.method, path: req.url, headers }, resolve);
        r.on("error", reject);
        r.end(requestBody);
      });
      const type = String(upstream.headers["content-type"] || "");
      const isHtml = /text\/html/i.test(type) && req.method === "GET";
      const watch = /json/i.test(type) || isHtml || !["GET", "HEAD"].includes(req.method);
      const outHeaders = Object.fromEntries(Object.entries(upstream.headers).filter(([k]) => !HOP.has(k)));
      // Redirecionamento para o endereço original continua passando pelo proxy.
      if (typeof outHeaders.location === "string" && outHeaders.location.startsWith(base.origin)) outHeaders.location = outHeaders.location.slice(base.origin.length) || "/";
      if (!isHtml && !watch) {
        res.writeHead(upstream.statusCode, outHeaders);
        upstream.pipe(res);
        return;
      }
      const body = await readBody(upstream, 8_000_000);
      if (isHtml) lastPage = new URL(req.url, "http://x").pathname;
      if (!isHtml)
        push(exchanges, exchange({ method: req.method, url: req.url, status: upstream.statusCode, type, requestBody, responseBody: body, withSession: Boolean(req.headers.cookie || req.headers.authorization), page: lastPage }));
      if (!isHtml) {
        res.writeHead(upstream.statusCode, outHeaders);
        return res.end(body);
      }
      const html = injectHtml(body.toString("utf8"), inject);
      delete outHeaders["content-length"];
      delete outHeaders["content-encoding"];
      // Página da observação nunca vai para o cache do navegador (senão o gravador "gruda").
      outHeaders["cache-control"] = "no-store";
      res.writeHead(upstream.statusCode, outHeaders);
      res.end(html);
    } catch (error) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end(`O Agent Generator não conseguiu falar com ${base.origin}: ${error.message}. O site ainda está rodando?`);
    }
  });

  async function internal(req, res) {
    const name = req.url.slice(PREFIX.length).split("?")[0];
    const reply = (status, data, type = "application/json; charset=utf-8") => {
      res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
      res.end(typeof data === "string" ? data : JSON.stringify(data));
    };
    if (req.method === "GET" && /^[\w-]+\.js$/.test(name)) {
      try {
        return reply(200, await readFile(new URL(name, CLIENT), "utf8"), "text/javascript; charset=utf-8");
      } catch {
        return reply(404, { erro: "não encontrado" });
      }
    }
    if (req.method === "GET" && routes[name]) return reply(200, await routes[name]({}, "GET"));
    if (req.method !== "POST") return reply(405, { erro: "use POST" });
    const raw = await readBody(req, 200_000);
    let body = {};
    try {
      body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
    } catch {
      return reply(400, { erro: "JSON inválido" });
    }
    if (name === "evento") {
      if (body && typeof body === "object" && typeof body.tipo === "string") push(events, body);
      return reply(204, "");
    }
    if (name === "fim") {
      reply(200, { ok: true });
      onEnd("botao");
      return;
    }
    if (routes[name]) {
      try {
        const out = await routes[name](body, "POST");
        return reply(out?.status || 200, out?.json ?? out);
      } catch (error) {
        return reply(400, { erro: error.message });
      }
    }
    return reply(404, { erro: "rota desconhecida" });
  }

  return { server, events, exchanges, target: base };
}
