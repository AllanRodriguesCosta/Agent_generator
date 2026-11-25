// Versão 0.11: chave de IA na instalação. Cada provedor diz como a chave é obtida e como testá-la.
// - OpenRouter: 1 clique. O instalador abre o login do OpenRouter, a pessoa autoriza e a chave
//   volta sozinha (OAuth com PKCE, sem cadastro de aplicativo). Dá acesso ao Gemini e a outros
//   modelos, inclusive gratuitos.
// - Gemini: assistido. O instalador abre a página das chaves do Google AI Studio (conta nova já
//   ganha uma chave), a pessoa copia e o instalador lê, testa e guarda.
// - Compatível com OpenAI (avançado): Groq, OpenAI, Ollama/LM Studio locais...
// Nada aqui grava a chave: quem guarda é o cofre (src/ia/cofre.js).
import { createHash, randomBytes } from "node:crypto";
import { OPENROUTER_URL } from "../agent/ia.js";

export const PROVEDORES = {
  gemini: {
    id: "gemini",
    nome: "Google Gemini",
    como: "assistido",
    resumo: "Gratuito com limites diários. Você copia a chave no Google AI Studio e o instalador testa e guarda.",
    paginaChave: "https://aistudio.google.com/app/apikey",
  },
  openrouter: {
    id: "openrouter",
    nome: "OpenRouter",
    como: "1 clique",
    resumo: "Entre com a sua conta e autorize: a chave volta sozinha para o instalador. Tem modelos gratuitos e o Gemini.",
    paginaChave: "https://openrouter.ai/settings/keys",
  },
  openai: {
    id: "openai",
    nome: "Compatível com OpenAI",
    como: "avançado",
    resumo: "OpenAI, Groq, DeepSeek ou um modelo local (Ollama, LM Studio). Informe o endereço, o modelo e a chave.",
    paginaChave: "",
  },
};

// Preferências de modelo (o primeiro que o provedor oferecer vence).
const GEMINI_PREFERIDOS = ["gemini-3.5-flash-lite", "gemini-3-flash-lite", "gemini-2.5-flash-lite", "gemini-3.5-flash", "gemini-3-flash", "gemini-2.5-flash", "gemini-2.0-flash"];
const OPENROUTER_PREFERIDOS = ["google/gemini-3.5-flash-lite", "google/gemini-3-flash-lite", "google/gemini-2.5-flash-lite", "google/gemini-2.5-flash", "openai/gpt-4o-mini", "meta-llama/llama-3.3-70b-instruct"];
const OPENROUTER_GRATIS = ["google/gemini-2.0-flash-exp:free", "meta-llama/llama-3.3-70b-instruct:free", "deepseek/deepseek-chat-v3-0324:free", "mistralai/mistral-small-3.2-24b-instruct:free", "qwen/qwen3-14b:free"];

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** PKCE S256: verificador aleatório (32 bytes) e o desafio = base64url(sha256(verificador)). */
export function pkcePair() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function openRouterAuthUrl({ callback, challenge, state, label = "Agent Generator" }) {
  const u = new URL("https://openrouter.ai/auth");
  u.searchParams.set("callback_url", callback);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  if (state) u.searchParams.set("state", state);
  if (label) u.searchParams.set("key_label", label.slice(0, 60));
  return u.href;
}

/** Troca o código do retorno pela chave (sk-or-...). */
export async function exchangeOpenRouterCode({ code, verifier, fetchImpl = fetch }) {
  const res = await fetchImpl(`${OPENROUTER_URL}/auth/keys`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data?.key !== "string" || !data.key) throw new Error(res.status === 403 ? "O OpenRouter recusou o código (expirou ou foi usado). Tente conectar de novo." : `O OpenRouter não devolveu a chave (${res.status}).`);
  return data.key;
}

/** Mostra só o começo e o fim da chave (nunca a chave inteira na janela ou no terminal). */
export function maskKey(chave) {
  const k = String(chave || "");
  if (!k) return "";
  if (k.length <= 12) return "•".repeat(k.length);
  return `${k.slice(0, 5)}…${k.slice(-4)}`;
}

// Texto que a pessoa entende para cada resposta de erro dos provedores.
export function explainStatus(status, provedor) {
  const nome = PROVEDORES[provedor]?.nome || "O provedor";
  if (status === 400 || status === 401 || status === 403)
    return provedor === "gemini"
      ? "O Google não aceitou a chave. Confira se copiou a chave inteira no Google AI Studio (ou crie outra) e tente de novo."
      : `${nome} não aceitou a chave. Confira se copiou a chave inteira ou conecte de novo.`;
  if (status === 402) return `${nome}: a conta está sem crédito para esse modelo. Use um modelo gratuito ou adicione crédito.`;
  if (status === 404) return `${nome}: endereço ou modelo não encontrado. Confira o endereço da API e o nome do modelo.`;
  if (status === 429) return `${nome}: limite de uso atingido agora. A chave funciona; tente de novo em alguns minutos.`;
  if (status >= 500) return `${nome} está com instabilidade (${status}). Tente de novo em instantes.`;
  if (status === 0) return `Não consegui falar com ${nome}. Confira a internet (ou um bloqueio de rede da empresa) e tente de novo.`;
  return `${nome} respondeu ${status}.`;
}

export function pickModel(disponiveis, preferidos, atual) {
  const ids = disponiveis.map((m) => String(m));
  if (atual && ids.includes(atual)) return atual;
  return preferidos.find((p) => ids.includes(p)) || "";
}

const sane = (chave) => String(chave || "").trim().replace(/^["']|["']$/g, "");

/**
 * Testa a chave de verdade (lista os modelos) e escolhe o modelo.
 * cfg: { provedor, chave, baseUrl, modelo }. Devolve { ok, mensagem, modelo, gratis, provedor, baseUrl, chave }.
 */
export async function testKey(cfg, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const provedor = cfg?.provedor;
  const chave = sane(cfg?.chave);
  if (!PROVEDORES[provedor]) return { ok: false, mensagem: "Escolha o provedor de IA." };
  if (provedor !== "openai" && (chave.length < 16 || /\s/.test(chave))) return { ok: false, mensagem: "Isso não parece uma chave. Copie a chave inteira (sem espaços) e tente de novo." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const get = async (url, headers) => {
    try {
      const res = await fetchImpl(url, { headers: { accept: "application/json", ...headers }, signal: controller.signal });
      return { status: res.status, data: res.ok ? await res.json().catch(() => null) : null };
    } catch {
      return { status: 0, data: null };
    }
  };
  try {
    if (provedor === "gemini") {
      const r = await get("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { "x-goog-api-key": chave });
      if (r.status !== 200) return { ok: false, mensagem: explainStatus(r.status, provedor) };
      const nomes = (r.data?.models || []).filter((m) => (m.supportedGenerationMethods || ["generateContent"]).includes("generateContent")).map((m) => String(m.name || "").replace(/^models\//, ""));
      const modelo = pickModel(nomes, GEMINI_PREFERIDOS, cfg.modelo) || nomes.find((n) => /flash/.test(n)) || nomes[0] || GEMINI_PREFERIDOS[0];
      return { ok: true, provedor, chave, baseUrl: "", modelo, gratis: true, mensagem: `Chave aceita pelo Google. Modelo: ${modelo}.` };
    }
    if (provedor === "openrouter") {
      const auth = { authorization: `Bearer ${chave}` };
      const k = await get(`${OPENROUTER_URL}/key`, auth);
      if (k.status !== 200) return { ok: false, mensagem: explainStatus(k.status, provedor) };
      const gratis = Boolean(k.data?.data?.is_free_tier);
      const m = await get(`${OPENROUTER_URL}/models`, {});
      const ids = (m.data?.data || []).map((x) => x.id).filter(Boolean);
      const free = ids.filter((id) => /:free$/.test(id));
      const modelo = gratis
        ? pickModel(ids, OPENROUTER_GRATIS, cfg.modelo?.endsWith?.(":free") ? cfg.modelo : "") || free.find((id) => /gemini|llama|deepseek|mistral|qwen/.test(id)) || free[0] || OPENROUTER_GRATIS[0]
        : pickModel(ids, OPENROUTER_PREFERIDOS, cfg.modelo) || ids[0] || OPENROUTER_PREFERIDOS[2];
      return { ok: true, provedor, chave, baseUrl: OPENROUTER_URL, modelo, gratis, mensagem: gratis ? `Conta conectada (sem crédito): usando o modelo gratuito ${modelo}, com limite diário de pedidos.` : `Conta conectada. Modelo: ${modelo}.` };
    }
    // Compatível com OpenAI: endereço obrigatório; sem chave só para Ollama/LM Studio locais.
    let base;
    try {
      base = new URL(String(cfg.baseUrl || "").trim());
    } catch {
      return { ok: false, mensagem: "Informe o endereço da API (ex.: https://api.groq.com/openai/v1 ou http://localhost:11434/v1)." };
    }
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(base.hostname);
    if (base.protocol !== "https:" && !local) return { ok: false, mensagem: "Use https:// (ou http://localhost para um modelo no seu computador)." };
    if (!chave && !local) return { ok: false, mensagem: "Esse provedor pede uma chave." };
    const baseUrl = base.href.replace(/\/+$/, "");
    const r = await get(`${baseUrl}/models`, chave ? { authorization: `Bearer ${chave}` } : {});
    if (r.status !== 200) return { ok: false, mensagem: explainStatus(r.status, provedor) };
    const ids = (r.data?.data || r.data?.models || []).map((x) => x.id || x.name).filter(Boolean);
    const modelo = cfg.modelo && /^[\w.:/-]{2,80}$/.test(cfg.modelo) ? cfg.modelo : ids[0] || "";
    if (!modelo) return { ok: false, mensagem: "Informe o nome do modelo (ex.: llama3.2 ou gpt-4o-mini)." };
    return { ok: true, provedor, chave, baseUrl, modelo, gratis: local, mensagem: `Endereço respondeu. Modelo: ${modelo}.` };
  } finally {
    clearTimeout(timer);
  }
}

/** Variáveis no formato do núcleo (iaConfig) a partir do que foi conectado. */
export function iaEnv(ia) {
  if (!ia?.provedor) return {};
  return { IA_PROVEDOR: ia.provedor, IA_CHAVE: ia.chave || "", ...(ia.baseUrl ? { IA_URL: ia.baseUrl } : {}), ...(ia.modelo ? { IA_MODELO: ia.modelo } : {}) };
}
