// Modo servidor (opcional): o agente responde pelo seu back-end Node, em vez de rodar no navegador.
// Útil para registrar perguntas ou esconder a base. Express:
//   import { createChatHandler } from "./agente/servidor.js";
//   app.post("/api/agente", express.json(), await createChatHandler());
// e em conhecimento/agente.json: "endpoint": "/api/agente".
import { readFile, appendFile } from "node:fs/promises";
import { createAgent } from "./nucleo/agent.js";
import { anonymize, isMiss } from "./nucleo/privacy.js";

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
  // Versão 0.4: memória da última lista (ids) e filtros da busca (cor, marca, preço...).
  ...(Array.isArray(c?.ultimos) ? { ultimos: c.ultimos.filter((id) => typeof id === "string" && id.length <= 80).slice(0, 6) } : {}),
  ...(c?.filtros && typeof c.filtros === "object" && !Array.isArray(c.filtros)
    ? { filtros: Object.fromEntries(Object.entries(c.filtros).filter(([k, v]) => /^[a-z]{2,12}$/.test(k) && ((typeof v === "string" && v.length <= 60) || (typeof v === "number" && Number.isFinite(v)))).slice(0, 8)) }
    : {}),
});
// Versão 0.4: frase não entendida vai para faltas.jsonl (sem dado pessoal), para o comando
// "agent-generator aprender" e para o modo treino mostrarem primeiro.
async function logMiss(file, frase) {
  const texto = anonymize(frase);
  if (texto.length < 2) return;
  await appendFile(file, `${JSON.stringify({ frase: texto, em: new Date().toISOString() })}\n`).catch(() => {});
}

// Handler para Express ou http puro: recebe { mensagem, contexto } e devolve a resposta em JSON.
export async function createChatHandler({ dir, faltas = new URL("./faltas.jsonl", import.meta.url) } = {}) {
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
    // Registro de frase não entendida enviado pelo widget (modo navegador com "registro").
    if (body.falta === true) {
      if (faltas) await logMiss(faltas, body.mensagem.slice(0, 500));
      return send(202, { ok: true });
    }
    const r = agent.reply(body.mensagem.slice(0, 500), sanitizeContext(body.contexto));
    if (faltas && isMiss(r)) await logMiss(faltas, body.mensagem);
    return send(200, r);
  };
}
