// Documentos (README, FAQ, docs/*.md): título, seções e pares de pergunta e resposta.
// Reconhece título de seção terminando em "?" seguido do texto, "P:/R:", "Q:/A:" e
// "Pergunta:/Resposta:", com ou sem negrito.

const clean = (s) =>
  String(s)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function parseMarkdown(content) {
  const lines = String(content).replace(/\r/g, "").split("\n");
  const titulo = clean(lines.find((l) => /^#\s/.test(l)) || "");
  const secoes = [];
  const faq = [];
  let current = null;
  let inCode = false;
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      current = { nivel: h[1].length, titulo: clean(h[2]), texto: [] };
      secoes.push(current);
      continue;
    }
    if (current && line.trim()) current.texto.push(line.trim());
  }
  for (const s of secoes) {
    const texto = clean(s.texto.filter((l) => !/^\s*(\|.*\||[-*]\s*$)/.test(l) && !QA.test(l)).join(" "));
    s.texto = texto.slice(0, 1200);
    if (/\?\s*$/.test(s.titulo) && texto) faq.push({ pergunta: s.titulo, resposta: firstParagraph(texto) });
  }
  // P:/R: em sequência (também Q:/A: e Pergunta:/Resposta:).
  const flat = lines.map((l) => l.trim());
  for (let i = 0; i < flat.length; i++) {
    const q = flat[i].match(/^\**\s*(?:P|Q|Pergunta)\s*[:.)-]\s*\**\s*(.+)$/i);
    if (!q) continue;
    for (let j = i + 1; j < Math.min(i + 4, flat.length); j++) {
      const a = flat[j].match(/^\**\s*(?:R|A|Resposta)\s*[:.)-]\s*\**\s*(.+)$/i);
      if (a) {
        faq.push({ pergunta: clean(q[1]), resposta: clean(a[1]) });
        break;
      }
    }
  }
  return { titulo, secoes: secoes.map((s) => ({ nivel: s.nivel, titulo: s.titulo, texto: s.texto })), faq };
}
const QA = /^\**\s*(?:P|Q|R|A|Pergunta|Resposta)\s*[:.)-]\s*\**\s*\S/i;
const firstParagraph = (t) => (t.length <= 600 ? t : `${t.slice(0, 600).replace(/\s+\S*$/, "")}…`);
