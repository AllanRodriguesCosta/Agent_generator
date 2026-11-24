// Leitura de páginas HTML (e, de forma aproximada, JSX, Vue, Svelte e templates): título,
// descrição, títulos de seção, links, formulários e textos visíveis. Só expressões regulares,
// sem dependências; o objetivo é contexto para o agente, não um parser completo.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", ccedil: "ç", atilde: "ã", otilde: "õ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", acirc: "â", ecirc: "ê", ocirc: "ô" };
export const decode = (s) =>
  String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

// Texto de um trecho de marcação: sem tags, sem expressões {…} de JSX, espaços normalizados.
export const textOf = (markup) =>
  decode(
    String(markup)
      .replace(/<(script|style|svg|noscript)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/\{[^{}]*\}/g, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*["'\`]([^"'\`]*)["'\`]\\s*\\})`, "i"));
  return m ? decode(m[1] ?? m[2] ?? m[3] ?? "").trim() : "";
};

export function parseMarkup(content) {
  const src = String(content).replace(/<!--[\s\S]*?-->/g, " ");
  const body = src.replace(/<(script|style|svg|noscript)\b[\s\S]*?<\/\1>/gi, " ");
  const titulo = textOf(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const metaTag = body.match(/<meta[^>]+name\s*=\s*["']description["'][^>]*>/i)?.[0] || "";
  const descricao = attr(metaTag, "content");
  const headings = [...body.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((m) => ({ nivel: Number(m[1]), texto: textOf(m[2]) }))
    .filter((h) => h.texto && h.texto.length <= 140);
  const links = [...body.matchAll(/<(a|Link|NuxtLink|RouterLink|router-link)\b([^>]*)>([\s\S]*?)<\/\1>/g)]
    .map((m) => ({ href: attr(m[2], "href") || attr(m[2], "to"), texto: textOf(m[3]) || attr(m[2], "aria-label") || attr(m[2], "title") }))
    .filter((l) => l.href && l.texto && l.texto.length <= 80 && !/^(javascript:|mailto:|tel:|data:)/i.test(l.href));
  const forms = [...body.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map((m) => {
    const inner = m[2];
    const labels = [...inner.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/gi)].map((l) => textOf(l[1])).filter(Boolean);
    const names = [...inner.matchAll(/<(input|textarea|select)\b([^>]*)>/gi)]
      .filter((i) => !/type\s*=\s*["'](hidden|submit|button|password)["']/i.test(i[2]))
      .map((i) => attr(i[2], "name") || attr(i[2], "placeholder"))
      .filter(Boolean);
    const botao = textOf(inner.match(/<button\b[^>]*>([\s\S]*?)<\/button>/i)?.[1] || "") || attr(inner.match(/<input[^>]+type\s*=\s*["']submit["'][^>]*>/i)?.[0] || "", "value");
    return { action: attr(m[1], "action"), method: (attr(m[1], "method") || "get").toLowerCase(), campos: [...new Set([...labels, ...names])].slice(0, 12), botao };
  });
  const buttons = [...body.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)].map((m) => textOf(m[1])).filter((t) => t && t.length <= 40);
  const paragraphs = [...body.matchAll(/<(p|li|td|dd)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => textOf(m[2]))
    .filter((t) => t.length >= 20 && t.length <= 400);
  const lang = attr(body.match(/<html\b[^>]*>/i)?.[0] || "", "lang");
  // Perguntas frequentes na própria página: <details><summary>, <dt>/<dd>, título com "?" seguido
  // de texto e JSON-LD FAQPage (schema.org).
  const faq = [];
  for (const m of body.matchAll(/<details\b([^>]*)>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi))
    faq.push({ pergunta: textOf(m[2]), resposta: textOf(m[3]), ancora: attr(m[1], "id") });
  for (const m of body.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)) faq.push({ pergunta: textOf(m[1]), resposta: textOf(m[2]), ancora: "" });
  for (const m of body.matchAll(/<h([2-4])\b([^>]*)>([\s\S]*?)<\/h\1>([\s\S]*?)(?=<h[1-4]\b|<\/(?:section|article|main|body)>|$)/gi)) {
    const q = textOf(m[3]);
    const a = textOf(m[4]);
    if (/\?\s*$/.test(q) && a.length >= 10) faq.push({ pergunta: q, resposta: a.slice(0, 800), ancora: attr(m[2], "id") });
  }
  for (const m of src.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      for (const node of [data, ...(Array.isArray(data["@graph"]) ? data["@graph"] : [])])
        if (node?.["@type"] === "FAQPage")
          for (const q of node.mainEntity || []) faq.push({ pergunta: textOf(q.name || ""), resposta: textOf(q.acceptedAnswer?.text || ""), ancora: "" });
    } catch {
      /* JSON-LD inválido: ignora */
    }
  }
  // Versão 0.7: seções (título + texto até o próximo título) para os resumos de conteúdo.
  const blocks = [];
  const heads = [...body.matchAll(/<h([1-3])\b([^>]*)>([\s\S]*?)<\/h\1>/gi)];
  for (const [i, h] of heads.entries()) {
    const start = h.index + h[0].length;
    const end = heads[i + 1]?.index ?? body.length;
    const chunk = body.slice(start, end).replace(/<(nav|header|footer|form|aside|button|select)\b[\s\S]*?<\/\1>/gi, " ");
    const texto = [...chunk.matchAll(/<(p|li|dd|blockquote|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => textOf(m[2])).filter((t) => t.length >= 15).join(" ");
    if (texto.length >= 80) blocks.push({ titulo: textOf(h[3]).slice(0, 120), texto: texto.slice(0, 3000), ancora: attr(h[2], "id") });
  }
  // Tipos e ações do schema.org (JSON-LD): ajudam a reconhecer o setor e as interações.
  const schemaTypes = [];
  const potentialActions = [];
  const walk = (node, depth = 0) => {
    if (!node || typeof node !== "object" || depth > 6) return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
    for (const t of [].concat(node["@type"] || [])) if (typeof t === "string" && schemaTypes.length < 30) schemaTypes.push(t);
    for (const a of [].concat(node.potentialAction || []))
      if (a && typeof a["@type"] === "string") {
        const target = [].concat(a.target || [])[0];
        const alvo = typeof target === "string" ? target : typeof target?.urlTemplate === "string" ? target.urlTemplate : "";
        potentialActions.push({ tipo: a["@type"], alvo: alvo.slice(0, 300) });
      }
    for (const [key, value] of Object.entries(node)) if (key !== "potentialAction" && typeof value === "object") walk(value, depth + 1);
  };
  for (const m of src.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1]));
    } catch {
      /* JSON-LD inválido: ignora */
    }
  }
  // Versão 0.8: imagens de conteúdo (galerias): legenda, data e etapa/categoria de cada foto.
  const images = imagesOf(body);
  return { images, blocks: blocks.slice(0, 30), schemaTypes: [...new Set(schemaTypes)], potentialActions: potentialActions.filter((a, i) => potentialActions.findIndex((b) => b.tipo === a.tipo && b.alvo === a.alvo) === i).slice(0, 10), titulo, descricao, lang, faq: faq.filter((f) => f.pergunta && f.resposta && f.pergunta.length <= 300).slice(0, 200), headings, links, forms, buttons: [...new Set(buttons)].slice(0, 20), paragraphs: [...new Set(paragraphs)].slice(0, 40), texto: textOf(body).slice(0, 20000) };
}

// Versão 0.8: fotos de conteúdo, na ordem da página. Cada uma leva a seção onde está (último
// título h2/h3 antes dela, ou data-etapa/data-categoria da figura), a legenda (figcaption, alt
// ou title) e a data (data-data, <time datetime> da figura ou data no nome do arquivo).
// Ícones, logos, sprites e imagens minúsculas ficam de fora.
const DECOR = /(^|[\/_.-])(logo|icon|icone|favicon|sprite|avatar|badge|bandeira|flag|seta|arrow|placeholder|pixel|spacer|loading)([\/_.-]|$)/i;
const DATE_ISO = /(20\d{2})[-_.](\d{2})[-_.](\d{2})/;
const DATE_BR = /\b(\d{2})\/(\d{2})\/(20\d{2})\b/;
export function dateIn(text) {
  const s = String(text || "");
  const iso = s.match(DATE_ISO);
  if (iso && Number(iso[2]) <= 12 && Number(iso[3]) <= 31) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(DATE_BR);
  if (br && Number(br[2]) <= 12 && Number(br[1]) <= 31) return `${br[3]}-${br[2]}-${br[1]}`;
  return "";
}
export function imagesOf(body) {
  const out = [];
  const heads = [...body.matchAll(/<h([1-3])\b([^>]*)>([\s\S]*?)<\/h\1>/gi)].map((h) => ({ at: h.index, nivel: Number(h[1]), texto: textOf(h[3]).slice(0, 80), ancora: attr(h[2], "id") }));
  const sectionAt = (pos) => {
    const before = heads.filter((h) => h.at < pos && h.nivel >= 2);
    return before[before.length - 1] || null;
  };
  // Figuras primeiro (legenda e data ficam dentro delas); depois <img> soltas.
  const taken = [];
  const figs = [...body.matchAll(/<figure\b([^>]*)>([\s\S]*?)<\/figure>/gi)];
  const push = (pos, imgTag, wrapAttrs = "", inner = "") => {
    const src = attr(imgTag, "src") || attr(imgTag, "data-src") || (attr(imgTag, "srcset").split(/\s+/)[0] ?? "");
    if (!src || /^data:/i.test(src) || /\.svg(\?|$)/i.test(src) || DECOR.test(src)) return;
    const w = Number(attr(imgTag, "width")) || 0;
    const h = Number(attr(imgTag, "height")) || 0;
    if ((w && w < 80) || (h && h < 80)) return;
    const alt = attr(imgTag, "alt");
    if (/\b(logo|ícone|icone|icon)\b/i.test(alt)) return;
    const caption = textOf(inner.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1] || "");
    const legenda = (caption || alt || attr(imgTag, "title")).slice(0, 200);
    const time = inner.match(/<time\b([^>]*)>([\s\S]*?)<\/time>/i);
    const data = dateIn(attr(wrapAttrs, "data-data") || attr(imgTag, "data-data") || attr(wrapAttrs, "data-date") || attr(imgTag, "data-date")) || (time ? dateIn(attr(time[1], "datetime")) || dateIn(textOf(time[2])) : "") || dateIn(caption) || dateIn(src);
    const sec = sectionAt(pos);
    const etapa = (attr(wrapAttrs, "data-etapa") || attr(imgTag, "data-etapa") || attr(wrapAttrs, "data-categoria") || attr(imgTag, "data-categoria") || sec?.texto || "").slice(0, 80);
    out.push({ src: src.slice(0, 300), legenda, data, etapa, ancora: sec?.ancora || "", pos });
  };
  for (const f of figs) {
    const imgs = [...f[2].matchAll(/<img\b[^>]*>/gi)];
    taken.push([f.index, f.index + f[0].length]);
    for (const im of imgs) push(f.index, im[0], f[1], f[2]);
  }
  for (const im of body.matchAll(/<img\b[^>]*>/gi)) {
    if (taken.some(([a, b]) => im.index >= a && im.index < b)) continue;
    // Imagem dentro de link de produto/card sem legenda própria conta igual; o alt é a legenda.
    push(im.index, im[0]);
  }
  return out.sort((a, b) => a.pos - b.pos).slice(0, 120).map(({ pos, ...img }, ordem) => ({ ...img, ordem }));
}
