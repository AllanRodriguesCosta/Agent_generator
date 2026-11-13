// Busca por palavras em comum com peso maior para as raras (IDF), a mesma ideia da busca na
// Central de Ajuda da Violet Voltage. Cada documento tem um texto principal (vale inteiro) e um
// secundário (vale 30%). Palavra com erro de digitação vira a mais próxima do índice.
import { tokens, STOPWORDS, stem } from "./text.js";

// Palavras de pergunta não ajudam a achar o assunto ("como", "onde", "qual"...).
// Verbos de "procurar" também ("vejo", "acho", "fica"): o assunto é o que vem depois.
const QUESTION_WORDS = new Set([
  "qual", "quais", "qua", "quand", "ond", "porqu", "pod", "poss", "consig", "fac", "faz", "algum", "sab", "saber", "quer", "voc", "com", "tem", "ter", "exist",
  "vej", "ver", "ach", "encontr", "fic", "acess", "abr", "mostr", "precis", "gostari", "dig", "diz", "sei", "algu", "cois", "favor", "porfav",
]);

export const terms = (value) => [
  ...new Set(
    tokens(value)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t))
      .map(stem)
      .filter((s) => !QUESTION_WORDS.has(s)),
  ),
];

function distance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // Letras trocadas de lugar ("entrgea") contam como um erro só.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

// documentos: [{ id, tipo, principal, medio, secundario, dados }]. Peso: principal (título,
// pergunta, nome) 1; medio (termos, sinônimos) 0,7; secundario (descrição, resposta) 0,3.
export function createIndex(documents) {
  const index = documents.map((doc) => {
    const main = new Set(terms(doc.principal));
    const mid = new Set(terms(doc.medio || "").filter((t) => !main.has(t)));
    return { doc, main, mid, extra: new Set(terms(doc.secundario || "")) };
  });
  const df = new Map();
  for (const { main, mid, extra } of index) for (const s of new Set([...main, ...mid, ...extra])) df.set(s, (df.get(s) || 0) + 1);
  const idf = (s) => Math.log(1 + index.length / (df.get(s) || 0.5));
  const mainVocabulary = new Set(index.flatMap((i) => [...i.main, ...i.mid]));
  // Variantes de cada palavra da frase. Fora dos títulos/perguntas: a mais próxima por digitação
  // (1 letra; 2 nas longas) ou as que começam igual ("pag" → "pagament").
  const variants = (s) => {
    if (mainVocabulary.has(s) || s.length < 3 || /\d/.test(s)) return [s];
    const out = df.has(s) ? [s] : [];
    let best = null;
    let bestDistance = s.length >= 7 ? 3 : 2;
    if (s.length >= 4)
      for (const v of mainVocabulary) {
        const dist = distance(s, v);
        if (dist < bestDistance) [best, bestDistance] = [v, dist];
      }
    if (best) return [...out, best];
    const prefixed = [...mainVocabulary]
      .filter((v) => (v.startsWith(s) && v.length - s.length <= 6) || (s.startsWith(v) && v.length >= 4))
      .sort((a, b) => (df.get(b) || 0) - (df.get(a) || 0))
      .slice(0, 2);
    return [...out, ...prefixed].length ? [...out, ...prefixed] : [s];
  };
  // Resultados do melhor para o pior. hits = palavras da frase achadas no texto principal;
  // ratio = parte do peso da frase que o documento cobre (0 a 1).
  function search(text, { tipo, limit = 5 } = {}) {
    const query = [...new Set(terms(text))].map(variants);
    if (!query.length) return [];
    // Palavra que não existe em lugar nenhum da base pesa pouco (1): não acha nada, mas indica
    // que a frase fala de algo a mais do que o documento cobre.
    const weight = (vs) => (vs.some((v) => df.has(v)) ? Math.max(...vs.filter((v) => df.has(v)).map(idf)) : 1);
    const total = query.reduce((sum, vs) => sum + weight(vs), 0);
    const results = [];
    for (const item of index) {
      if (tipo && item.doc.tipo !== tipo) continue;
      let score = 0;
      let hits = 0;
      for (const vs of query) {
        const main = vs.filter((v) => item.main.has(v));
        if (main.length) {
          score += Math.min(weight(vs), Math.max(...main.map(idf)));
          hits++;
          continue;
        }
        const mid = vs.filter((v) => item.mid.has(v));
        if (mid.length) {
          score += 0.7 * Math.min(weight(vs), Math.max(...mid.map(idf)));
          hits++;
          continue;
        }
        const extra = vs.filter((v) => item.extra.has(v));
        if (extra.length) score += 0.3 * Math.min(weight(vs), Math.max(...extra.map(idf)));
      }
      if (score > 0) results.push({ doc: item.doc, score, hits, ratio: score / total, query: query.length });
    }
    return results.sort((a, b) => b.score - a.score || b.hits - a.hits).slice(0, limit);
  }
  return { search, size: index.length };
}

// Forte o bastante para responder sozinha: boa parte da frase e (em frases maiores) duas palavras.
export const strong = (hit) => Boolean(hit && hit.ratio >= 0.5 && (hit.hits >= 2 || (hit.query === 1 && hit.hits === 1)));
// Fraca ("talvez isto ajude"): ao menos uma palavra no texto principal; em frases de 3+ palavras,
// duas palavras ou metade do peso (evita palpite por uma palavra parecida no meio de outra frase).
export const weak = (hit) => Boolean(hit && hit.hits >= 1 && hit.ratio >= 0.3 && (hit.query <= 2 || hit.hits >= 2 || hit.ratio >= 0.5));
