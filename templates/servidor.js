// Modo servidor (opcional): o agente responde pelo seu back-end Node, em vez de rodar no navegador.
// Útil para registrar perguntas ou esconder a base. Express:
//   import { createChatHandler } from "./agente/servidor.js";
//   app.post("/api/agente", express.json(), await createChatHandler());
// e em conhecimento/agente.json: "endpoint": "/api/agente".
import { readFile } from "node:fs/promises";
import { createAgent } from "./nucleo/agent.js";

const FILES = ["agente", "intencoes", "faq", "paginas", "catalogo", "fluxos", "consultas"];

export async function loadKnowledgeFromDisk(dir = new URL("./conhecimento/", import.meta.url)) {
  const raw = {};
  for (const name of FILES) {
    try {
      raw[name] = JSON.parse(await readFile(new URL(`${name}.json`, dir), "utf8"));
    } catch {
      /* arquivo opcional */
    }
  }
  return raw;
}

const sanitizeContext = (c) => ({
  ...(Number.isInteger(c?.voltas) && c.voltas >= 0 && c.voltas < 10000 ? { voltas: c.voltas } : {}),
  ...(typeof c?.busca === "string" ? { busca: c.busca.slice(0, 200) } : {}),
  ...(Number.isInteger(c?.pagina) && c.pagina >= 0 && c.pagina <= 20 ? { pagina: c.pagina } : {}),
  ...(typeof c?.fluxo === "string" && /^[a-z0-9-]{1,60}$/.test(c.fluxo) ? { fluxo: c.fluxo } : {}),
});

// Handler para Express ou http puro: recebe { mensagem, contexto } e devolve a resposta em JSON.
export async function createChatHandler({ dir } = {}) {
  const agent = createAgent(await loadKnowledgeFromDisk(dir));
  return async (req, res) => {
    let body = req.body;
    if (body === undefined) {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 10_000) break;
      }
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        body = null;
      }
    }
    const send = (status, data) => {
      res.statusCode = status;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify(data));
    };
    if (!body || typeof body.mensagem !== "string") return send(400, { erro: "Envie { mensagem: \"...\" }." });
    return send(200, agent.reply(body.mensagem.slice(0, 500), sanitizeContext(body.contexto)));
  };
}
