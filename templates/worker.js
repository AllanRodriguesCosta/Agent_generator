// Serviço do agente na Cloudflare (versão 0.11/0.12). Publicado pelo Agent Generator pela API da
// Cloudflare (sem wrangler e sem novo deploy do site). Roda no plano gratuito dos Workers.
//   POST /api/ia   { mensagem } -> { frase, texto? }  O agente roda no navegador; só a frase que ele
//                  não entendeu chega aqui. A IA reescreve com o vocabulário do site e o agente
//                  responde com a base (nunca inventa preço, prazo ou política).
//   GET  /saude    estado do serviço (sem segredos)
//   GET  /         as linhas para colar no site (modo completo)
//   /agente/*      (modo completo) widget, núcleo e base como arquivos estáticos: a Cloudflare serve
//                  sem chamar este código e sem contar no limite diário.
// Variáveis (o instalador grava): ORIGENS, ORIGENS_LOCAIS, SITE, MODO, VERSAO, IA_PROVEDOR, IA_MODELO, IA_URL,
// IA_POR_MINUTO, IA_POR_DIA e o segredo IA_CHAVE (criptografado pela Cloudflare; ninguém lê de volta).
// KV opcional FALTAS: frases não entendidas, sem dado pessoal, por 90 dias (para o "aprender").
import { iaConfig, interpret, limiter, dailyLimiter } from "./nucleo/ia.js";
import { anonymize } from "./nucleo/privacy.js";
import vocabulario from "./vocabulario.js";

const NOVENTA_DIAS = 90 * 86400;
let estado = null;

// Configuração e limites por isolate (refeitos quando as variáveis mudam).
function preparar(env) {
  const assinatura = [env.IA_PROVEDOR, env.IA_MODELO, env.IA_URL, String(env.IA_CHAVE || "").length, env.IA_POR_MINUTO, env.IA_POR_DIA, env.ORIGENS, env.ORIGENS_LOCAIS, env.SITE].join("|");
  if (estado?.assinatura === assinatura) return estado;
  const ia = iaConfig({ ...env, IA_TEMPO_MS: env.IA_TEMPO_MS || "8000" });
  const site = String(env.SITE || "").replace(/\/+$/, "");
  const origens = String(env.ORIGENS || site)
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  estado = {
    assinatura,
    ia,
    site,
    origens,
    locais: env.ORIGENS_LOCAIS === "1",
    minuto: limiter(ia?.porMinuto || 8),
    dia: dailyLimiter(ia?.porDia || 300),
    faltasDia: dailyLimiter(400),
    porIp: new Map(),
  };
  return estado;
}

// Até 6 frases por minuto por visitante (IP); o mapa é limpo quando cresce.
function ipLiberado(e, ip, agora = Date.now()) {
  const lista = (e.porIp.get(ip) || []).filter((t) => agora - t < 60000);
  lista.push(agora);
  e.porIp.set(ip, lista);
  if (e.porIp.size > 5000) e.porIp.clear();
  return lista.length <= 6;
}

function cors(e, origin) {
  if (!origin) return { permitido: true, headers: {} };
  const ok = e.origens.includes("*") || e.origens.includes(origin) || (e.locais && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  return ok
    ? { permitido: true, headers: { "access-control-allow-origin": e.origens.includes("*") ? "*" : origin, vary: "Origin", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "600" } }
    : { permitido: false, headers: { vary: "Origin" } };
}

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra } });

async function guardarFalta(env, e, frase, ctx) {
  if (!env.FALTAS || !frase || !e.faltasDia()) return;
  const chave = `f:${new Date().toISOString()}:${crypto.randomUUID().slice(0, 8)}`;
  const gravar = env.FALTAS.put(chave, "", { expirationTtl: NOVENTA_DIAS, metadata: { f: frase.slice(0, 200) } }).catch(() => {});
  if (ctx?.waitUntil) ctx.waitUntil(gravar);
  else await gravar;
}

export default {
  async fetch(request, env, ctx) {
    const e = preparar(env);
    const url = new URL(request.url);
    const origin = request.headers.get("origin") || "";

    if (url.pathname === "/api/ia") {
      const c = cors(e, origin);
      if (request.method === "OPTIONS") return new Response(null, { status: c.permitido ? 204 : 403, headers: c.headers });
      if (request.method !== "POST") return json({ erro: "Use POST." }, 405, c.headers);
      if (!c.permitido) return json({ erro: "Site não autorizado a usar este agente." }, 403, c.headers);
      const ip = request.headers.get("cf-connecting-ip") || "?";
      if (!ipLiberado(e, ip)) return json({ erro: "Muitas mensagens. Tente em instantes." }, 429, c.headers);
      if (Number(request.headers.get("content-length") || 0) > 4000) return json({ erro: "Mensagem grande demais." }, 413, c.headers);
      const bruto = await request.text().catch(() => "");
      if (bruto.length > 4000) return json({ erro: "Mensagem grande demais." }, 413, c.headers);
      let corpo = null;
      try {
        corpo = JSON.parse(bruto || "{}");
      } catch {
        corpo = null;
      }
      if (!corpo || typeof corpo.mensagem !== "string" || !corpo.mensagem.trim()) return json({ erro: 'Envie { "mensagem": "..." }.' }, 400, c.headers);
      const mensagem = anonymize(corpo.mensagem.slice(0, 500));
      // Toda frase que chega aqui o agente do navegador não entendeu: vai para o "aprender".
      await guardarFalta(env, e, mensagem, ctx);
      if (!e.ia || !e.minuto() || !e.dia()) return json({}, 200, c.headers);
      const r = await interpret(mensagem, vocabulario, e.ia, { fetchImpl: fetch });
      return json(r || {}, 200, c.headers);
    }

    if (url.pathname === "/saude") return json({ ok: true, ia: e.ia?.provedor || "nenhuma", modelo: e.ia?.modelo || "", site: e.site, modo: env.MODO || "ia", versao: env.VERSAO || "", faltas: Boolean(env.FALTAS) });

    if (url.pathname === "/" && request.method === "GET") {
      const base = `${url.origin}/agente/`;
      const texto =
        env.MODO === "completo"
          ? `Serviço do agente de ${e.site || "seu site"} no ar.\n\nCole no site, antes de </body>:\n<link rel="stylesheet" href="${base}widget.css">\n<script type="module" src="${base}widget.js"></script>\n\nSites autorizados: ${e.origens.join(", ") || "(nenhum)"}\nIA: ${e.ia?.provedor || "nenhuma"}\n`
          : `Serviço de IA do agente de ${e.site || "seu site"} no ar.\nO agente roda no site; aqui chegam só as frases que ele não entendeu.\nIA: ${e.ia?.provedor || "nenhuma"}\n`;
      return new Response(texto, { headers: { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" } });
    }
    return new Response("Não encontrado", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  },
};
