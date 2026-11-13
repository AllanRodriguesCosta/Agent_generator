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
  return { titulo, descricao, lang, faq: faq.filter((f) => f.pergunta && f.resposta && f.pergunta.length <= 300).slice(0, 200), headings, links, forms, buttons: [...new Set(buttons)].slice(0, 20), paragraphs: [...new Set(paragraphs)].slice(0, 40), texto: textOf(body).slice(0, 20000) };
}
