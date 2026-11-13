// Versão 0.5: mais coisas lidas no raio X.
// - sitemap.xml: lista oficial de páginas (bom para sites gerados por framework);
// - arquivos de tradução (locales/i18n): textos da interface e perguntas frequentes em JSON;
// - metadata do Next.js (export const metadata = { title, description });
// - mensagens de erro do código (throw new Error("..."), res.status(400).json({ message: "..." })),
//   para o agente (e a IA) explicarem "apareceu a mensagem X".
export function pagesFromSitemap(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    try {
      const u = new URL(m[1], "http://site");
      const href = u.pathname || "/";
      if (!out.includes(href) && !/\.(xml|jpg|png|pdf)$/i.test(href)) out.push(href);
    } catch {
      /* URL inválida */
    }
  }
  return out.slice(0, 300);
}
// "/sobre-nos" → "Sobre nós" (título provisório quando o sitemap traz página sem arquivo).
export const titleFromPath = (href) => {
  const last = decodeURIComponent(href.replace(/\/$/, "").split("/").pop() || "");
  const t = last.replace(/\.(html?|php)$/, "").replace(/[-_]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Início";
};

export const LOCALE_FILE = /(^|\/)(locales?|i18n|lang|translations?|messages)\/(?:.*\/)?([a-z]{2}(?:[-_][A-Za-z]{2})?)(?:\/[\w-]+)?\.json$/;
const Q_KEYS = /^(question|pergunta|q|title|titulo)$/i;
const A_KEYS = /^(answer|resposta|a|body|texto|text|content|description)$/i;
// Strings de um JSON de tradução e pares pergunta/resposta (FAQ) dentro dele.
export function readLocale(content) {
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    return { textos: [], faq: [] };
  }
  const textos = [];
  const faq = [];
  const walk = (v, depth = 0) => {
    if (depth > 6 || v == null) return;
    if (typeof v === "string") {
      if (v.length >= 3 && v.length <= 400 && /\s/.test(v) && !/[{<]|^https?:/.test(v)) textos.push(v);
      return;
    }
    if (Array.isArray(v)) return v.slice(0, 300).forEach((x) => walk(x, depth + 1));
    if (typeof v === "object") {
      const keys = Object.keys(v);
      const q = keys.find((k) => Q_KEYS.test(k));
      const a = keys.find((k) => A_KEYS.test(k));
      if (q && a && typeof v[q] === "string" && typeof v[a] === "string" && /\?\s*$/.test(v[q]) && v[a].length >= 10) faq.push({ pergunta: v[q].trim().slice(0, 200), resposta: v[a].trim().slice(0, 1000) });
      for (const k of keys.slice(0, 400)) walk(v[k], depth + 1);
    }
  };
  walk(data);
  return { textos: textos.slice(0, 2000), faq: faq.slice(0, 100) };
}
// Next.js app router: export const metadata = { title: "...", description: "..." }.
export function nextMetadata(content) {
  const block = String(content).match(/export\s+const\s+metadata[^=]*=\s*\{([\s\S]{0,1500}?)\n?\}/);
  if (!block) return null;
  const pick = (key) => block[1].match(new RegExp(`\\b${key}\\s*:\\s*["'\`]([^"'\`]{2,300})["'\`]`))?.[1];
  const titulo = pick("title");
  const descricao = pick("description");
  return titulo || descricao ? { titulo: titulo || "", descricao: descricao || "" } : null;
}
const ERROR_RES = [
  /\bthrow\s+new\s+\w*Error\(\s*(?:\d{3}\s*,\s*)?["'`]([^"'`$]{8,160})["'`]/g,
  /\.status\(\s*4\d\d\s*\)\s*\.json\(\s*\{\s*(?:error|message|erro|mensagem|detail)\s*:\s*["'`]([^"'`$]{8,160})["'`]/g,
  /\bAppError\(\s*4\d\d\s*,\s*["'`]([^"'`$]{8,160})["'`]/g,
  /\braise\s+\w*(?:Error|Exception)\(\s*["']([^"']{8,160})["']/g,
  /\bHttpException\(\s*(?:status_code\s*=\s*)?4\d\d\s*,\s*(?:detail\s*=\s*)?["']([^"']{8,160})["']/g,
];
// Só mensagens para pessoas (com espaço e letra minúscula), sem detalhes técnicos.
export function errorMessages(content) {
  const out = [];
  for (const re of ERROR_RES)
    for (const m of String(content).matchAll(re)) {
      const msg = m[1].trim();
      if (/\s/.test(msg) && /[a-zà-ú]/.test(msg) && !/(undefined|null|stack|sql|query|ENV|process\.|\bat\b \w+\.)/i.test(msg) && !out.includes(msg)) out.push(msg);
    }
  return out;
}
