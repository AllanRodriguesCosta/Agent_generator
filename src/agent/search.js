// Busca por palavras em comum com peso maior para as raras (IDF), a mesma ideia da busca na
// Central de Ajuda da Violet Voltage. Cada documento tem um texto principal (vale inteiro) e um
// secundário (vale 30%). Palavra com erro de digitação vira a mais próxima do índice.
// Versão 0.10: a ORDEM dos resultados é dada pelo BM25 (Robertson e Zaragoza, 2009): palavra
// repetida conta mais, com saturação (k1), e texto comprido é normalizado pelo tamanho (b), o que
// evita que conteúdos longos e catálogos grandes ganhem só por terem muitas palavras. A
// "cobertura" (ratio: quanto da frase o documento cobre) continua decidindo se a resposta é forte.
import { tokens, STOPWORDS, stem } from "./text.js";

// Palavras de pergunta não ajudam a achar o assunto ("como", "onde", "qual"...).
// Verbos de "procurar" também ("vejo", "acho", "fica"): o assunto é o que vem depois.
const QUESTION_WORDS = new Set([
  "qual", "quais", "qua", "quand", "ond", "porqu", "pod", "poss", "consig", "fac", "faz", "algum", "sab", "saber", "quer", "voc", "com", "tem", "ter", "exist",
  "vej", "ver", "ach", "encontr", "fic", "acess", "abr", "mostr", "precis", "gostari", "dig", "diz", "sei", "algu", "cois", "favor", "porfav",
]);

// Palavras (raízes) de um texto com repetição, para a frequência do BM25.
const termList = (value) =>
  tokens(value)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem)
    .filter((s) => !QUESTION_WORDS.has(s));
const counts = (list) => list.reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map());
export const BM25 = { k1: 1.2, b: 0.75 };

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
// sinonimos (0.7): grupos de palavras equivalentes (ex.: ["frete", "entrega", "shipping"]) vindos
// da base setorial; uma palavra da frase também procura as outras do grupo.
export function createIndex(documents, { sinonimos = [] } = {}) {
  const index = documents.map((doc) => {
    const mainList = termList(doc.principal);
    const main = new Set(mainList);
    const midList = termList(doc.medio || "").filter((t) => !main.has(t));
    const extraList = termList(doc.secundario || "");
    return {
      doc,
      main,
      mid: new Set(midList),
      extra: new Set(extraList),
      tf: [counts(mainList), counts(midList), counts(extraList)],
      len: [mainList.length, midList.length, extraList.length],
    };
  });
  const df = new Map();
  for (const { main, mid, extra } of index) for (const s of new Set([...main, ...mid, ...extra])) df.set(s, (df.get(s) || 0) + 1);
  const idf = (s) => Math.log(1 + index.length / (df.get(s) || 0.5));
  // BM25: IDF probabilístico e tamanho médio de cada campo (título, termos, texto).
  const N = index.length;
  const idfBm25 = (s) => Math.log(1 + (N - (df.get(s) || 0) + 0.5) / ((df.get(s) || 0) + 0.5));
  const avg = [0, 1, 2].map((f) => index.reduce((sum, i) => sum + i.len[f], 0) / (N || 1) || 1);
  const tfNorm = (tf, len, f) => (tf * (BM25.k1 + 1)) / (tf + BM25.k1 * (1 - BM25.b + (BM25.b * len) / avg[f]));
  const mainVocabulary = new Set(index.flatMap((i) => [...i.main, ...i.mid]));
  // Variantes de cada palavra da frase. Fora dos títulos/perguntas: a mais próxima por digitação
  // (1 letra; 2 nas longas) ou as que começam igual ("pag" → "pagament").
  const synonyms = new Map();
  for (const group of sinonimos) {
    const stems = [...new Set(group.flatMap((w) => terms(w)))];
    for (const st of stems) synonyms.set(st, new Set([...(synonyms.get(st) || []), ...stems.filter((x) => x !== st)]));
  }
  const expand = (list) => {
    const out = new Set(list);
    for (const v of list) for (const x of synonyms.get(v) || []) if (df.has(x)) out.add(x);
    return [...out];
  };
  const variants = (s) => expand(baseVariants(s));
  const baseVariants = (s) => {
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
    const words = [...new Set(terms(text))];
    const query = words.map(variants);
    // Sinônimo vale menos que a palavra escrita (0,6): "shipping" acha "frete", mas um texto que
    // tenha a própria palavra fica na frente.
    const own = words.map((w) => new Set(baseVariants(w)));
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
      let bm25 = 0;
      for (const [qi, vs] of query.entries()) {
        // Melhor entre título (1), termos (0,7) e texto (0,3); palavra escrita vale mais que
        // sinônimo, então "shipping" nos termos vence "frete" (sinônimo) no título.
        const part = (set, w) => {
          const found = vs.filter((v) => set.has(v));
          if (!found.length) return 0;
          const exact = found.filter((v) => own[qi].has(v));
          const pick = exact.length ? exact : found;
          return w * (exact.length ? 1 : 0.6) * Math.min(weight(vs), Math.max(...pick.map(idf)));
        };
        const main = part(item.main, 1);
        const mid = part(item.mid, 0.7);
        const extra = part(item.extra, 0.3);
        score += Math.max(main, mid, extra);
        if (main || mid) hits++;
        // BM25 do termo: melhor campo, com o mesmo peso de campo e o desconto do sinônimo.
        let best = 0;
        for (const [f, w] of [[0, 1], [1, 0.7], [2, 0.3]]) {
          for (const v of vs) {
            const tf = item.tf[f].get(v);
            if (!tf) continue;
            best = Math.max(best, w * (own[qi].has(v) ? 1 : 0.6) * idfBm25(v) * tfNorm(tf, item.len[f], f));
          }
        }
        bm25 += best;
      }
      if (score > 0) results.push({ doc: item.doc, score, hits, ratio: score / total, query: query.length, bm25 });
    }
    // Ordem: cobertura arredondada primeiro (quem cobre mais da frase vem antes), BM25 desempata
    // entre os que cobrem o mesmo tanto (o texto mais focado no assunto ganha do mais comprido).
    const band = (r) => Math.round(r.ratio * 20);
    return results.sort((a, b) => band(b) - band(a) || b.bm25 - a.bm25 || b.score - a.score || b.hits - a.hits).slice(0, limit);
  }
  // Versão 0.10: a base tem estas palavras exatamente (sem correção de digitação)?
  const knows = (text) => {
    const ts = terms(text);
    return ts.length > 0 && ts.every((t) => df.has(t));
  };
  return { search, knows, size: index.length };
}

// Forte o bastante para responder sozinha: boa parte da frase e (em frases maiores) duas palavras.
export const strong = (hit) => Boolean(hit && hit.ratio >= 0.5 && (hit.hits >= 2 || (hit.query === 1 && hit.hits === 1)));
// Fraca ("talvez isto ajude"): ao menos uma palavra no texto principal; em frases de 3+ palavras,
// duas palavras ou metade do peso (evita palpite por uma palavra parecida no meio de outra frase).
export const weak = (hit) => Boolean(hit && hit.hits >= 1 && hit.ratio >= 0.3 && (hit.query <= 2 || hit.hits >= 2 || hit.ratio >= 0.5));
