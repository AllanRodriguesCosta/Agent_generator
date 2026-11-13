// Consultas ao vivo (versão 0.3): o widget lê uma lista da API do próprio site com a sessão de
// quem está logado (pedidos, agendamentos, inscrições...) e este módulo transforma a lista numa
// resposta curta. Os campos são descobertos pelo nome; consultas.json pode forçar cada um.
const KEYS = {
  codigo: ["codigo", "code", "numero", "number", "id", "_id", "rowkey", "pedido", "protocolo"],
  status: ["status", "situacao", "estado", "state", "etapa", "fase"],
  data: ["createdat", "created_at", "data", "date", "criadoem", "criado_em", "datapedido", "updatedat", "updated_at"],
  total: ["total", "totalcents", "total_cents", "valor", "valortotal", "amount", "preco", "price"],
  nome: ["nome", "name", "titulo", "title", "produto", "servico", "descricao"],
};
const norm = (k) =>
  String(k)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z_]/g, "");
export function lookupFields(sample, forced = {}) {
  const out = {};
  for (const [kind, names] of Object.entries(KEYS)) {
    if (forced[kind] && sample && forced[kind] in sample) out[kind] = forced[kind];
    else out[kind] = Object.keys(sample || {}).find((k) => names.includes(norm(k))) || null;
  }
  return out;
}
export const STATUS_WORDS = KEYS.status;

export function listOf(data) {
  if (Array.isArray(data)) return data;
  for (const key of ["data", "items", "itens", "results", "resultados", "rows", "pedidos", "orders"]) if (Array.isArray(data?.[key])) return data[key];
  if (data && typeof data === "object") for (const v of Object.values(data)) if (Array.isArray(v)) return v;
  return [];
}

const fmtDate = (v, idioma) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat(idioma || "pt-BR", { dateStyle: "short" }).format(d);
};
const fmtMoney = (v, key, { idioma = "pt-BR", moeda = "BRL" } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  try {
    return new Intl.NumberFormat(idioma, { style: "currency", currency: moeda }).format(/cent/i.test(key || "") ? n / 100 : n);
  } catch {
    return String(n);
  }
};

/**
 * cfg: { rotulo, campos, pagina, login }   resposta: { status (HTTP), dados (JSON) }
 * Devolve { texto, acoes } para o widget mostrar.
 */
export function describeLookup(cfg, resposta, agente = {}) {
  const rotulo = cfg.rotulo || "registros";
  const page = cfg.pagina ? [{ rotulo: `Ver ${rotulo}`.slice(0, 60), href: cfg.pagina }] : [];
  if (resposta.status === 401 || resposta.status === 403)
    return { texto: `Para ver ${rotulo}, entre na sua conta. Depois é só me perguntar de novo.`, acoes: cfg.login ? [{ rotulo: "Entrar", href: cfg.login }] : page, precisaLogin: true };
  if (!resposta.status || resposta.status >= 400) return { texto: `Não consegui consultar ${rotulo} agora.${page.length ? " Você pode ver direto na página." : ""}`, acoes: page };
  const items = listOf(resposta.dados).filter((x) => x && typeof x === "object");
  if (!items.length) return { texto: `Não encontrei ${rotulo} na sua conta.`, acoes: page };
  // Campos de vários itens: o primeiro pode não ter todos (ex.: total só nos pedidos novos).
  const f = lookupFields(Object.assign({}, ...items.slice(0, 20).reverse()), cfg.campos);
  const sorted = f.data ? [...items].sort((a, b) => String(b[f.data]).localeCompare(String(a[f.data]))) : items;
  const latest = sorted[0];
  const code = f.codigo && latest[f.codigo] != null ? `#${String(latest[f.codigo]).slice(0, 8).toUpperCase()}` : "";
  const bits = [f.data && fmtDate(latest[f.data], agente.idioma), f.nome && typeof latest[f.nome] === "string" && latest[f.nome].slice(0, 60), f.total && fmtMoney(latest[f.total], f.total, agente)].filter(Boolean);
  const status = f.status && latest[f.status] != null ? String(latest[f.status]) : "";
  const singular = cfg.singular || rotulo.replace(/oes$/, "ao").replace(/ões$/, "ão").replace(/s$/, "");
  const head = `${singular.charAt(0).toUpperCase()}${singular.slice(1)} mais recente${code ? ` (${code})` : ""}${bits.length ? `, de ${bits.join(", ")}` : ""}`;
  let texto = status ? `${head}: “${status}”.` : `${head}.`;
  if (sorted.length > 1) {
    const open = f.status ? sorted.slice(1).filter((x) => !/conclu|entreg|cancel|finaliz|fechad|done|complete|delivered|canceled|cancelled/i.test(String(x[f.status] ?? ""))).length : 0;
    texto += ` Você tem ${sorted.length} ${rotulo} no total${open ? `, ${open} ainda em andamento` : ""}.`;
  }
  return { texto, acoes: page };
}
