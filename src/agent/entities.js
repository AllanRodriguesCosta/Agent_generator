// Versão 0.4: entidades do catálogo e memória curta da conversa.
// - Entidades: categoria, cor, marca e tamanho saem do próprio catálogo (nada fixo por site);
//   "tem tênis preto da Nike até 300?" filtra por categoria, cor, marca e preço de uma vez.
// - Memória: a última lista mostrada fica no contexto. "E em azul?", "e o mais barato?",
//   "compara os dois", "me fala do segundo" usam essa lista em vez de recomeçar.
import { normalize, tokens } from "./text.js";

export const COLORS = ["preto", "branco", "azul", "vermelho", "verde", "amarelo", "rosa", "roxo", "lilas", "cinza", "marrom", "bege", "laranja", "dourado", "prateado", "vinho", "nude", "creme", "caramelo", "grafite"];
// Feminino e plural das cores ("preta", "brancas", "vermelhos").
const colorForms = (c) => {
  const base = c.replace(/o$/, "");
  return [c, `${c}s`, ...(c.endsWith("o") ? [`${base}a`, `${base}as`] : []), ...(c === "marrom" ? ["marrons"] : [])];
};
const SIZES = ["pp", "p", "m", "g", "gg", "xg", "xgg"];
const plural = (w) => [w, `${w}s`, w.replace(/s$/, ""), w.replace(/(oes|aes)$/, "ao")];
const textOf = (item) => normalize(`${item.nome} ${item.categoria} ${item.tags.join(" ")} ${item.descricao}`);
const nameTags = (item) => normalize(`${item.nome} ${item.tags.join(" ")}`);
const wordRe = (w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`);

// Vocabulário do catálogo: só entra o que existe nos itens.
export function catalogVocab(items = []) {
  const categorias = new Map();
  for (const it of items) if (it.categoria) for (const f of plural(normalize(it.categoria))) if (f.length > 2) categorias.set(f, it.categoria);
  const cores = COLORS.filter((c) => items.some((it) => colorForms(c).some((f) => wordRe(f).test(nameTags(it)))));
  // Marca: primeira palavra do nome repetida em 2+ itens, ou tag "marca:x".
  const first = new Map();
  for (const it of items) {
    const w = tokens(it.nome)[0];
    if (w && w.length > 1 && !/^\d+$/.test(w)) first.set(w, (first.get(w) || 0) + 1);
    for (const t of it.tags) if (/^marca:/i.test(t)) first.set(normalize(t.slice(6)), 99);
  }
  const genericos = new Set([...categorias.keys(), ...COLORS, "kit", "novo", "nova", "o", "a", "de"]);
  const marcas = [...first].filter(([w, n]) => n >= 2 && !genericos.has(w)).map(([w]) => w);
  const tamanhos = [...new Set(items.flatMap((it) => it.tags.map((t) => normalize(t).replace(/^tamanho:?\s*/, "")).filter((t) => SIZES.includes(t) || /^\d{2}$/.test(t))))];
  return { categorias, cores, marcas, tamanhos };
}

// "tênis preto da Nike até 300" → { categoria, cor, marca, ... }. Preço fica com extractPrice.
export function extractEntities(text, vocab) {
  const t = normalize(text);
  const out = {};
  for (const [form, original] of [...vocab.categorias].sort((a, b) => b[0].length - a[0].length))
    if (wordRe(form).test(t)) {
      out.categoria = original;
      break;
    }
  for (const c of vocab.cores) if (colorForms(c).some((f) => wordRe(f).test(t))) out.cor = c;
  // Cor que nenhum item tem: o agente diz que não tem e mostra as cores que existem.
  if (!out.cor) for (const c of COLORS) if (!vocab.cores.includes(c) && colorForms(c).some((f) => wordRe(f).test(t))) out.cor = c;
  for (const m of vocab.marcas) if (wordRe(m).test(t)) out.marca = m;
  const size = t.match(/\b(?:tamanho|tam|numero|n)\s*(pp|p|m|g|gg|xg|xgg|\d{2})\b/);
  if (size && vocab.tamanhos.includes(size[1])) out.tamanho = size[1];
  if (/\b(mais barat[oa]s?|menor preco|mais em conta|economic[oa])\b/.test(t)) out.ordem = "asc";
  else if (/\b(mais car[oa]s?|melhor[es]?|top|premium|mais complet[oa])\b/.test(t)) out.ordem = "desc";
  return out;
}
export const hasEntities = (e) => Boolean(e.categoria || e.cor || e.marca || e.tamanho);
export function matchesEntities(item, e) {
  if (e.categoria && normalize(item.categoria) !== normalize(e.categoria)) return false;
  if (e.cor && !colorForms(e.cor).some((f) => wordRe(f).test(nameTags(item)))) return false;
  if (e.marca && !wordRe(e.marca).test(textOf(item))) return false;
  if (e.tamanho && !item.tags.some((tag) => normalize(tag).replace(/^tamanho:?\s*/, "") === e.tamanho)) return false;
  return true;
}
// Cores disponíveis num conjunto de itens (para "não tenho em azul; tenho em preto e branco").
export const colorsIn = (items, vocab) => vocab.cores.filter((c) => items.some((it) => colorForms(c).some((f) => wordRe(f).test(nameTags(it)))));
export const describeEntities = (e, money) =>
  [e.categoria && e.categoria.toLowerCase(), e.cor && `em ${e.cor}`, e.marca && `da ${e.marca.charAt(0).toUpperCase()}${e.marca.slice(1)}`, e.tamanho && `tamanho ${e.tamanho.toUpperCase()}`, e.max != null && `até ${money(e.max)}`].filter(Boolean).join(" ");

// ---------- Memória curta ----------
// Continuação da busca anterior: "e em azul?", "e da adidas?", "tem em preto?", "até 200?".
export const FOLLOW_UP = /^(e|e se for|e em|e na|e no|e da|e do|e de|tem em|tem na|tem no|tem da|tem do|em|na|no|da|do|so|somente|apenas)\b/;
export const ORDINALS = [/\b(primeir[oa]|1o|1a|um)\b/, /\b(segund[oa]|2o|2a|dois|duas)\b/, /\b(terceir[oa]|3o|3a|tres)\b/];
export const COMPARE = /\b(compar\w*|diferenca|qual (e )?(o )?melhor|qual (a |o )?(melhor|diferenca)|versus|vs)\b/;
export const DETAIL = /\b(me fala|fala mais|detalhes?|mais sobre|quero (o|a)|gostei d[oa]|e (o|a)|sobre (o|a)|como e (o|a))\b/;
export function pickOrdinals(text) {
  const t = normalize(text);
  const picks = ORDINALS.map((re, i) => (re.test(t) ? i : -1)).filter((i) => i >= 0);
  if (/\b(os dois|as duas|ambos|ambas)\b/.test(t)) return [0, 1];
  return picks;
}
// Diferenças entre itens: preço, categoria e o que cada um tem a mais nas tags.
export function compareItems(items, money) {
  const lines = items.map((it, i) => {
    const own = it.tags.filter((t) => !items.some((o, j) => j !== i && o.tags.includes(t))).slice(0, 3);
    return `• ${it.nome}: ${it.preco != null ? money(it.preco) : "sem preço"}${it.categoria ? `, ${it.categoria.toLowerCase()}` : ""}${own.length ? `; só ele tem: ${own.join(", ")}` : ""}.`;
  });
  const priced = items.filter((it) => it.preco != null);
  const cheap = priced.length >= 2 ? priced.reduce((a, b) => (b.preco < a.preco ? b : a)) : null;
  const diff = cheap ? Math.max(...priced.map((p) => p.preco)) - cheap.preco : 0;
  return [`Comparando ${items.length} itens:`, ...lines, ...(cheap && diff > 0 ? [`O mais em conta é ${cheap.nome} (${money(diff)} a menos).`] : [])].join("\n");
}
