// Observação (versão 0.3): o que o proxy registra de cada chamada enquanto a pessoa usa o site.
// Nada de senha, token, cookie, e-mail, telefone, documento ou cartão: chaves sensíveis viram
// "[oculto]" e valores com cara de dado pessoal também. Só formas e amostras curtas.
export const SENSITIVE = /(senha|password|passwd|pass\b|token|secret|segredo|auth|cookie|session|sessao|cpf|cnpj|rg\b|documento|cartao|card|cvv|cvc|email|e_mail|telefone|phone|celular|whatsapp|endereco|address|cep\b|zip|nascimento|birth|iban|pix|chave)/i;
const PERSONAL_VALUE = /(@[\w-]+\.[\w.]+|\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b|\b(?:\d[ -]?){13,19}\b|\(?\d{2}\)?\s?9?\d{4}-?\d{4})/;
export const LIMITS = { amostra: 30, texto: 160, chaves: 40, profundidade: 3, eventos: 3000 };

// /api/orders/8f1c2a9e-... → /api/orders/:id (números, UUID e hashes longos).
export function templatePath(pathname) {
  return (
    pathname
      .split("/")
      .map((seg) => (/^\d+$/.test(seg) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(seg) || /^[0-9a-f]{16,}$/i.test(seg) || /^[A-Za-z0-9_-]{20,}$/.test(seg) ? ":id" : seg))
      .join("/") || "/"
  );
}

export function sanitize(value, key = "", depth = 0) {
  if (SENSITIVE.test(key)) return "[oculto]";
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return PERSONAL_VALUE.test(value) ? "[oculto]" : value.slice(0, LIMITS.texto);
  if (depth >= LIMITS.profundidade) return Array.isArray(value) ? `[lista com ${value.length}]` : "[objeto]";
  if (Array.isArray(value)) return value.slice(0, LIMITS.amostra).map((v) => sanitize(v, key, depth + 1));
  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, LIMITS.chaves)
        .map(([k, v]) => [k, sanitize(v, k, depth + 1)]),
    );
  return null;
}

// Só os nomes dos campos enviados (nunca os valores).
export function keysOf(body) {
  if (!body || typeof body !== "object") return [];
  return Object.keys(body)
    .slice(0, LIMITS.chaves)
    .map((k) => (SENSITIVE.test(k) ? `${k} (sensível)` : k));
}

export function parseJson(buffer, type = "") {
  if (!/json/i.test(type) || !buffer?.length || buffer.length > 600_000) return undefined;
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    return undefined;
  }
}

// Uma chamada observada: método, caminho com :id, parâmetros de busca, status e amostra.
export function exchange({ method, url, status, type, requestBody, responseBody, withSession, page }) {
  const u = new URL(url, "http://observado");
  const json = parseJson(responseBody, type);
  let sent;
  try {
    sent = requestBody?.length ? JSON.parse(requestBody.toString("utf8")) : undefined;
  } catch {
    sent = undefined;
  }
  return {
    metodo: method,
    caminho: templatePath(u.pathname),
    original: u.pathname,
    query: [...u.searchParams.keys()].slice(0, 12),
    exemploQuery: Object.fromEntries([...u.searchParams.entries()].slice(0, 6).map(([k, v]) => [k, SENSITIVE.test(k) ? "[oculto]" : v.slice(0, 60)])),
    status,
    tipo: String(type || "").split(";")[0],
    comSessao: Boolean(withSession),
    camposEnviados: keysOf(sent),
    resposta: json === undefined ? undefined : sanitize(json),
    pagina: page || "",
    em: new Date().toISOString(),
  };
}
