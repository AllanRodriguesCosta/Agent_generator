// Formas de contato visíveis no site (e-mail, telefone, WhatsApp, redes, endereço, horário).
// Só de textos de páginas e documentos, nunca do código ou de configuração.
const uniq = (a) => [...new Set(a)].slice(0, 5);
export function contactsFrom(texts) {
  const all = texts.join("\n");
  return {
    emails: uniq((all.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) || []).filter((e) => !/example\.(com|org)$|@(sentry|users\.noreply)/i.test(e))),
    telefones: uniq((all.match(/\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g) || []).map((t) => t.trim())),
    whatsapp: uniq(all.match(/https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/[^\s"'<>)]+/g) || []),
    redes: uniq(all.match(/https?:\/\/(?:www\.)?(?:instagram|facebook|linkedin|tiktok|youtube|x|twitter)\.com\/[^\s"'<>)]+/g) || []),
    horario: uniq((all.match(/\b(?:seg|ter|qua|qui|sex|s[áa]b|dom)[a-zç-]*\.?\s*(?:a|à|-|–|até)\s*(?:seg|ter|qua|qui|sex|s[áa]b|dom)[a-zç-]*\.?,?\s*(?:das\s*)?\d{1,2}\s?h[^.\n·|]{0,15}/gi) || []).map((h) => h.trim())),
  };
}
