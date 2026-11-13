// Versão 0.4: editor visual da base. Um servidor local (só 127.0.0.1) mostra a base em
// formulários (perguntas frequentes, intenções, páginas, conversas em etapas e textos do agente),
// testa o agente com o rascunho na hora, mostra o acerto e salva com backup.
// Proteção: cada sessão tem um código aleatório na URL; pedidos sem ele, de outro endereço ou de
// outra origem são recusados (nenhum site aberto no navegador consegue mexer na base).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createAgent } from "../agent/agent.js";
import { checkKnowledge } from "../agent/knowledge.js";
import { evaluateKnowledge } from "../eval/index.js";

const CLIENT = new URL("./client/", import.meta.url);
const MAX_BODY = 2_000_000;

async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw Object.assign(new Error("Base grande demais."), { status: 413 });
  }
  return JSON.parse(raw || "{}");
}
const send = (res, status, data, type = "application/json; charset=utf-8") => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" });
  res.end(typeof data === "string" ? data : JSON.stringify(data));
};
// Resumo da avaliação para o painel: porcentagens e até 8 frases que erraram.
export function evaluationSummary(raw) {
  const r = evaluateKnowledge(raw);
  const erros = ["intencoes", "faq", "paginas"].flatMap((k) => (r[k]?.erros || []).map((e) => ({ parte: k, ...e }))).slice(0, 8);
  return { geral: r.geral, porcentagens: r.porcentagens, erros };
}

/**
 * load(): base atual (objeto com agente, intencoes, faq...); save(base): grava (com backup).
 * Devolve { url, token, stop }.
 */
export async function startEditor({ load, save, port = 4720, listen }) {
  const token = randomBytes(16).toString("hex");
  let bound = port;
  const allowedHost = () => [`127.0.0.1:${bound}`, `localhost:${bound}`];
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${bound}`);
      if (!allowedHost().includes(req.headers.host || "")) return send(res, 421, { erro: "Endereço não permitido." });
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        if (url.searchParams.get("t") !== token) return send(res, 403, "Abra o endereço mostrado no terminal (ele tem o código da sessão).", "text/plain; charset=utf-8");
        const html = await readFile(new URL("editor.html", CLIENT), "utf8");
        return send(res, 200, html, "text/html; charset=utf-8");
      }
      if (req.method === "GET" && url.pathname === "/editor.js") return send(res, 200, await readFile(new URL("editor.js", CLIENT), "utf8"), "text/javascript; charset=utf-8");
      if (!url.pathname.startsWith("/api/")) return send(res, 404, { erro: "Não encontrado." });
      // API: código da sessão no cabeçalho e, em POST, origem igual ao próprio editor.
      if (req.headers["x-editor-token"] !== token) return send(res, 403, { erro: "Sessão inválida. Abra o endereço do terminal de novo." });
      const origin = req.headers.origin;
      if (req.method === "POST" && origin && !allowedHost().map((h) => `http://${h}`).includes(origin)) return send(res, 403, { erro: "Origem não permitida." });
      if (req.method === "GET" && url.pathname === "/api/base") {
        const raw = await load();
        return send(res, 200, { base: checkKnowledge(raw).knowledge, avaliacao: evaluationSummary(raw) });
      }
      if (req.method !== "POST") return send(res, 405, { erro: "Método não permitido." });
      const data = await body(req);
      const draft = data.base && typeof data.base === "object" ? data.base : await load();
      if (url.pathname === "/api/testar") {
        const agent = createAgent(draft);
        return send(res, 200, agent.reply(String(data.mensagem || "").slice(0, 500), data.contexto && typeof data.contexto === "object" ? data.contexto : {}));
      }
      if (url.pathname === "/api/avaliar") return send(res, 200, { ...evaluationSummary(draft), problemas: checkKnowledge(draft).problems });
      if (url.pathname === "/api/salvar") {
        const { knowledge, problems } = checkKnowledge(draft);
        const saved = await save(knowledge);
        return send(res, 200, { ok: true, problemas: problems, backup: saved?.backup || null, avaliacao: evaluationSummary(knowledge) });
      }
      return send(res, 404, { erro: "Não encontrado." });
    } catch (error) {
      return send(res, error.status || 400, { erro: error instanceof SyntaxError ? "JSON inválido." : error.message });
    }
  });
  bound = listen ? await listen(server, port) : await new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(port)));
  return { url: `http://127.0.0.1:${bound}/?t=${token}`, token, port: bound, stop: () => new Promise((ok) => server.close(ok)) };
}
