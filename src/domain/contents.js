// Base complementar de conteúdos (versão 0.7): cada seção informativa do site (páginas, docs,
// README, guias) vira um resumo curto com o link para o texto original. O resumo é EXTRATIVO
// (TextRank, Mihalcea e Tarau, 2004): escolhe as frases mais centrais do próprio texto, sem
// escrever nada novo. Assim o agente apresenta o assunto e encaminha para a fonte sem inventar.
import { tokens, STOPWORDS, stem, normalize } from "../agent/text.js";

const ABBREV = /\b(sr|sra|dr|dra|prof|etc|ex|p|pág|n|nº|art|inc|ltda|av|r)\.$/i;

// Divide em frases sem quebrar abreviações ("Dr.", "art.") e números ("1.500").
export function sentences(text) {
  const parts = String(text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+(?=[A-ZÀ-Ý0-9"“(])/);
  const out = [];
  for (const p of parts) {
    if (out.length && ABBREV.test(out.at(-1))) out[out.length - 1] += ` ${p}`;
    else out.push(p.trim());
  }
  return out.filter((s) => s.length >= 25 && s.length <= 400 && /[a-zà-ý]/i.test(s));
}

const content = (s) => new Set(tokens(s).filter((t) => t.length > 2 && !STOPWORDS.has(t)).map(stem));

// TextRank com a similaridade original (palavras em comum normalizadas pelo log do tamanho).
export function textRank(list, { d = 0.85, iter = 40 } = {}) {
  const sets = list.map(content);
  const n = list.length;
  const w = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      let common = 0;
      for (const t of sets[i]) if (sets[j].has(t)) common++;
      const den = Math.log(sets[i].size + 1) + Math.log(sets[j].size + 1);
      w[i][j] = w[j][i] = den ? common / den : 0;
    }
  const out = w.map((row) => row.reduce((a, b) => a + b, 0));
  let score = Array(n).fill(1);
  for (let k = 0; k < iter; k++) {
    const next = Array(n).fill(1 - d);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (w[j][i] && out[j]) next[i] += (d * w[j][i] * score[j]) / out[j];
    const delta = next.reduce((m, v, i) => Math.max(m, Math.abs(v - score[i])), 0);
    score = next;
    if (delta < 1e-4) break;
  }
  return score;
}

/**
 * Resumo de um texto: as `frases` mais centrais, na ordem original, até `max` caracteres.
 * A primeira frase ganha um bônus leve (em textos informativos ela costuma apresentar o tema).
 */
export function summarize(text, { frases = 2, max = 420, titulo = "" } = {}) {
  const list = sentences(text);
  if (!list.length) return "";
  if (list.length <= frases) return list.join(" ").slice(0, max);
  const titleTerms = content(titulo);
  const score = textRank(list).map((s, i) => {
    const overlap = [...content(list[i])].filter((t) => titleTerms.has(t)).length;
    return s * (i === 0 ? 1.15 : 1) * (1 + 0.15 * Math.min(overlap, 3));
  });
  const chosen = score
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s - a.s)
    .slice(0, frases)
    .sort((a, b) => a.i - b.i)
    .map((x) => list[x.i]);
  let out = "";
  for (const s of chosen) if ((out + " " + s).trim().length <= max) out = `${out} ${s}`.trim();
  return out || chosen[0].slice(0, max);
}

// Palavras-chave do texto (frequência ponderada, sem palavras vazias), para a busca.
export function keywords(text, limit = 8) {
  const freq = new Map();
  for (const t of tokens(text)) if (t.length > 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t)) freq.set(t, (freq.get(t) || 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([t]) => t);
}

const SKIP_TITLE = /^(menu|navega|rodape|footer|header|cabecalho|copyright|todos os direitos|redes sociais|siga|newsletter|cookies?)\b/;
export const PUBLISHED = /(^|\/)(content|posts|_posts|blog|artigos|articles|guias|guides|ajuda|help|faq|src\/pages|pages|app|public|static)\//i;
const DEV_DOC = /(^|\/)(readme|agents|changelog|contributing|license|licen[cs]a|code_of_conduct|security)[^/]*$/i;
// Endereço provável do documento publicado: content/blog/meu-post.md → /blog/meu-post.
export function docLink(file = "") {
  const path = file.replace(/\\/g, "/").replace(/^(src\/)?(content|pages|app|public|static|_posts)\//i, "").replace(/(^|\/)(index|page)\.mdx?$/i, "").replace(/\.mdx?$/i, "");
  return `/${path}`.replace(/\/+$/, "") || "/";
}
const slug = (v) => normalize(v).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/**
 * Conteúdos do relatório do raio X: seções de páginas (blocos) e de documentos (.md).
 * Só entram textos com pelo menos 2 frases ou 160 caracteres; perguntas frequentes já têm resposta.
 */
export function buildContents(report = {}, { limite = 300 } = {}) {
  const faqQuestions = new Set((report.faq || []).map((f) => normalize(f.pergunta)));
  const seen = new Set();
  const out = [];
  const add = ({ titulo, texto, link, fonte }) => {
    const t = String(titulo || "").replace(/\s+/g, " ").trim().slice(0, 120);
    const body = String(texto || "").replace(/\s+/g, " ").trim();
    if (!t || SKIP_TITLE.test(normalize(t)) || faqQuestions.has(normalize(t))) return;
    if (body.length < 160 && sentences(body).length < 2) return;
    const resumo = summarize(body, { titulo: t });
    if (!resumo) return;
    const key = normalize(resumo).slice(0, 120);
    if (seen.has(key)) return;
    seen.add(key);
    let id = slug(t) || `conteudo-${out.length + 1}`;
    for (let n = 2; out.some((c) => c.id === id); n++) id = `${slug(t)}-${n}`;
    // Versão 0.10: resumo maior para "explica melhor" (só quando acrescenta de verdade).
    const longo = summarize(body, { frases: 5, max: 900, titulo: t });
    const detalhe = longo.length >= resumo.length + 60 ? longo : "";
    out.push({ id, titulo: t, resumo, ...(detalhe ? { detalhe } : {}), topicos: keywords(`${t} ${t} ${body}`, 8).join(" "), link, fonte });
  };
  for (const p of report.paginas || [])
    for (const b of p.blocos || []) add({ titulo: b.titulo || p.titulo, texto: b.texto, link: b.ancora ? `${p.href}#${b.ancora}` : p.href, fonte: p.arquivo || p.href });
  // Documentos (.md/.mdx) só quando são conteúdo publicado (blog, guias, coleções do Astro/Next/
  // Hugo/Jekyll). README, docs/ de desenvolvimento e afins explicam o código, não o site: ficam de
  // fora para o agente não falar de "npm install" com o cliente.
  for (const d of report.documentos || []) {
    if (!PUBLISHED.test(d.arquivo || "") || DEV_DOC.test(d.arquivo || "")) continue;
    for (const s of d.secoes || []) add({ titulo: s.titulo || d.titulo, texto: s.texto, link: d.link || docLink(d.arquivo), fonte: d.arquivo });
  }
  return out.slice(0, limite);
}
