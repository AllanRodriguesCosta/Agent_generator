import { features } from "./text.js";
// Classificador de intenção Naive Bayes multinomial (suavização aditiva, prior uniforme).
// Origem: assistente da Violet Voltage. Treina em milissegundos a partir das frases de exemplo.
// Suavização baixa (0,1): com a de Laplace (1), frases de uma palavra ("oi") ficavam sem confiança.
export const ALPHA = 0.1;

// Distância de edição simples, para aceitar erros de digitação ("frte" → "frete").
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // Versão 0.5: letras trocadas de lugar ("aujda" → "ajuda") contam como um erro só.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}
// Palavra fora do vocabulário vira a mais próxima dele (1 letra de diferença; 2 nas longas).
function nearest(model, f) {
  if (f.includes("_") || f.length < 3 || /\d/.test(f)) return null;
  const limit = f.length >= 7 ? 2 : 1;
  let best = null;
  let bestDistance = limit + 1;
  for (const v of model.unigrams) {
    if (Math.abs(v.length - f.length) > limit || (f.length <= 4 && v[0] !== f[0])) continue;
    const dist = distance(f, v);
    if (dist < bestDistance) [best, bestDistance] = [v, dist];
  }
  return best;
}

export function train(examples) {
  const vocabulary = new Set();
  const intents = {};
  for (const [intent, phrases] of Object.entries(examples)) {
    const counts = new Map();
    let total = 0;
    for (const phrase of phrases)
      for (const f of features(phrase)) {
        counts.set(f, (counts.get(f) || 0) + 1);
        vocabulary.add(f);
        total++;
      }
    intents[intent] = { counts, total };
  }
  return { vocabulary, intents, unigrams: [...vocabulary].filter((f) => !f.includes("_")) };
}

// Devolve as intenções da mais provável para a menos provável, com probabilidade e a
// cobertura (fração dos atributos da frase que o modelo conhece). Sem atributo conhecido,
// a confiança é zero: a frase não se parece com nada do treino.
export function classify(model, text) {
  const all = features(text).map((f) => (model.vocabulary.has(f) ? f : nearest(model, f) || f));
  const known = all.filter((f) => model.vocabulary.has(f));
  // Cobertura só pelas palavras: pares vizinhos inéditos são normais em frases novas.
  const words = all.filter((f) => !f.includes("_"));
  const coverage = words.length ? words.filter((f) => model.vocabulary.has(f)).length / words.length : 0;
  const size = model.vocabulary.size;
  const scores = Object.entries(model.intents).map(([intent, { counts, total }]) => {
    let log = 0;
    for (const f of known) log += Math.log(((counts.get(f) || 0) + ALPHA) / (total + ALPHA * size));
    return { intent, log };
  });
  if (!known.length) return scores.map((s) => ({ intent: s.intent, p: 0, coverage }));
  const max = Math.max(...scores.map((s) => s.log));
  const sum = scores.reduce((acc, s) => acc + Math.exp(s.log - max), 0);
  return scores
    .map((s) => ({ intent: s.intent, p: Math.exp(s.log - max) / sum, coverage }))
    .sort((a, b) => b.p - a.p);
}
