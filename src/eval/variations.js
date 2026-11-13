// Versão 0.5: frases de teste geradas sozinhas, para a avaliação não ficar fácil demais. A partir
// de cada pergunta frequente e de cada exemplo de intenção: sem acento e minúsculas, com um erro
// de digitação, e no jeito informal ("vc", "pra", "tá", "oi, ...").
// Palavra inteira com acento: \b não funciona com letras acentuadas, então usa \p{L}.
const word = (w) => new RegExp(`(?<!\\p{L})${w}(?!\\p{L})`, "giu");
const INFORMAL = [[word("vocês"), "vcs"], [word("você"), "vc"], [word("para"), "pra"], [word("está"), "tá"], [word("estou"), "tô"], [word("porque"), "pq"], [word("qual é"), "qual"], [word("queria"), "qria"]];
const plain = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[?!.]+$/, "");
// Troca duas letras do meio da palavra mais longa ("entrega" → "entrgea"): erro comum no celular.
export function typo(t) {
  const words = t.split(" ");
  let i = -1;
  words.forEach((w, j) => {
    if (/^[\p{L}]{5,}$/u.test(w) && (i < 0 || w.length > words[i].length)) i = j;
  });
  if (i < 0) return null;
  const w = words[i];
  const k = Math.floor(w.length / 2);
  words[i] = w.slice(0, k - 1) + w[k] + w[k - 1] + w.slice(k + 1);
  return words.join(" ");
}
export function informal(t) {
  let out = t;
  for (const [re, by] of INFORMAL) out = out.replace(re, by);
  return out === t ? `oi, ${t.charAt(0).toLowerCase()}${t.slice(1)}` : out;
}
export function variationsOf(phrase) {
  const t = String(phrase || "").trim();
  if (t.split(/\s+/).length < 2) return [];
  return [...new Set([plain(t), typo(t), informal(t)].filter((v) => v && v !== t))];
}
