// Versão 0.8: contexto da pessoa logada e fotos. Roda no navegador (copiado para nucleo/).
//  - Dados do usuário: o site entrega (agente.identificar({...}), <script id="agente-usuario"> ou
//    a "fonte" de perfil.json lida com a sessão do próprio site). Ficam só na memória/sessão do
//    navegador; nunca vão para a IA opcional nem para o registro de faltas.
//  - Respostas de perfil: moldes com {campos} ("Sua unidade {unidade} está na etapa {etapa}").
//  - Fotos: escolhe a mais recente, a primeira ou a de uma data dentro de uma galeria.
import { normalize } from "./text.js";

const norm = (k) => normalize(String(k)).replace(/[^a-z0-9]/g, "");

/** Valor de um campo nos dados do usuário: caminho com pontos ("obra.etapa"), apelidos e busca
 *  por nome em qualquer nível (até 4) — "percentual" acha { obra: { percentualConcluido } }. */
export function valueAt(data, campo, apelidos = {}) {
  if (!data || typeof data !== "object" || !campo) return undefined;
  const names = [campo, ...(Array.isArray(apelidos[campo]) ? apelidos[campo] : [])];
  for (const name of names) {
    const direct = String(name).split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), data);
    if (direct != null && typeof direct !== "object") return direct;
  }
  const wanted = names.map((n) => norm(String(n).split(".").pop()));
  const walk = (o, depth) => {
    if (!o || typeof o !== "object" || depth > 4) return undefined;
    for (const [k, v] of Object.entries(o)) if (v != null && typeof v !== "object" && wanted.some((w) => norm(k) === w)) return v;
    for (const [k, v] of Object.entries(o)) if (v != null && typeof v !== "object" && wanted.some((w) => w.length >= 4 && norm(k).startsWith(w))) return v;
    for (const v of Object.values(o)) {
      const found = v && typeof v === "object" ? walk(Array.isArray(v) ? v[0] : v, depth + 1) : undefined;
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return walk(data, 0);
}

const fmtValue = (v, idioma = "pt-BR") => {
  if (typeof v === "number") return new Intl.NumberFormat(idioma, { maximumFractionDigits: 2 }).format(v);
  if (typeof v === "boolean") return v ? "sim" : "não";
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(s)) {
    const d = new Date(s.length === 10 ? `${s}T12:00:00` : s);
    if (!Number.isNaN(d.getTime())) return new Intl.DateTimeFormat(idioma, { dateStyle: "short" }).format(d);
  }
  return s.slice(0, 160);
};

/** Preenche "{campo}" com os dados; devolve { texto, faltando: [campos sem valor] }. */
// Trechos entre colchetes são opcionais: "[ Rastreio: {rastreio}.]" some se faltar o rastreio.
export function fillTemplate(molde, data, { apelidos = {}, idioma } = {}) {
  const faltando = [];
  const optional = String(molde || "").replace(/\[([^[\]]{1,300})\]/g, (_, part) => {
    const r = fillTemplate(part, data, { apelidos, idioma });
    return r.faltando.length ? "" : ` ${r.texto} `;
  });
  const texto = optional.replace(/\{([\w.]{1,60})\}/g, (_, campo) => {
    const v = valueAt(data, campo, apelidos);
    if (v === undefined || v === "") {
      faltando.push(campo);
      return "";
    }
    return fmtValue(v, idioma);
  });
  return { texto: texto.replace(/\s+([,.])/g, "$1").replace(/\s{2,}/g, " ").trim(), faltando };
}

/** Primeiro nome para a saudação ("Ana Souza" → "Ana"); vazio se não houver. */
export function firstName(user) {
  const n = valueAt(user, "nome", { nome: ["name", "primeiroNome", "firstName", "given_name"] });
  return typeof n === "string" ? n.trim().split(/\s+/)[0].slice(0, 40) : "";
}

/** Limpa os dados recebidos do site: só valores simples e objetos rasos, sem campos sensíveis. */
const SENSITIVE = /(senha|password|token|secret|segredo|cpf|cnpj|rg|cartao|card|cvv|iban|hash|jwt|session|cookie)/i;
export function sanitizeUser(data, depth = 0) {
  if (!data || typeof data !== "object" || depth > 3) return null;
  if (Array.isArray(data)) return data.slice(0, 10).map((v) => (v && typeof v === "object" ? sanitizeUser(v, depth + 1) : v)).filter((v) => v != null);
  const out = {};
  for (const [k, v] of Object.entries(data).slice(0, 60)) {
    if (SENSITIVE.test(k) || k.length > 60) continue;
    if (v == null) continue;
    if (typeof v === "object") {
      const inner = sanitizeUser(v, depth + 1);
      if (inner && Object.keys(inner).length) out[k] = inner;
    } else if (["string", "number", "boolean"].includes(typeof v)) out[k] = typeof v === "string" ? v.slice(0, 300) : v;
  }
  return out;
}

/** Foto escolhida: "ultima" (padrão), "primeira" ou a mais próxima de uma data (AAAA-MM-DD). */
export function pickPhoto(galeria, { modo = "ultima", data = "" } = {}) {
  const itens = galeria?.itens || [];
  if (!itens.length) return null;
  const dated = itens.filter((i) => i.data);
  if (data && dated.length) {
    const t = new Date(data).getTime();
    return [...dated].sort((a, b) => Math.abs(new Date(a.data) - t) - Math.abs(new Date(b.data) - t))[0];
  }
  // Com datas, "última" é a mais recente; sem datas, vale a ordem da página (a última da lista).
  if (dated.length) {
    const sorted = [...dated].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.ordem - b.ordem));
    return modo === "primeira" ? sorted[0] : sorted[sorted.length - 1];
  }
  return modo === "primeira" ? itens[0] : itens[itens.length - 1];
}

/** "última foto", "primeira foto", "foto de 10/11" → { modo, data }. */
export function photoRequest(n) {
  const iso = n.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  const br = n.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
  const data = iso ? iso[0] : br ? `${br[3] || new Date().getFullYear()}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}` : "";
  const modo = /\b(primeir[ao]s?|mais antig[ao]s?|inicio|comeco)\b/.test(n) ? "primeira" : "ultima";
  return { modo, data };
}
