// Mapeia uma lista de objetos qualquer (produtos, serviços, cursos, cardápio...) para itens do
// catálogo do agente, descobrindo sozinho quais campos são nome, preço, categoria etc.
// Usado pelo raio X (arquivos JSON/CSV) e pelo widget (catálogo lido da API do site).
export const KEYS = {
  nome: ["nome", "name", "titulo", "title", "modelo", "produto", "product", "label"],
  preco: ["preco", "price", "valor", "value", "precocents", "pricecents", "price_cents", "preco_centavos", "amount"],
  categoria: ["categoria", "category", "tipo", "type", "grupo", "secao", "section", "departamento"],
  descricao: ["descricao", "description", "resumo", "summary", "detalhes", "details", "texto"],
  imagem: ["imagem", "image", "foto", "photo", "img", "thumbnail", "imageurl", "image_url", "imagem_url"],
  link: ["link", "url", "href", "slug", "path"],
  id: ["id", "_id", "sku", "codigo", "code", "rowkey", "slug"],
  marca: ["marca", "brand", "fabricante"],
  tags: ["tags", "etiquetas", "palavras", "keywords"],
};
const norm = (k) =>
  k
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z_]/g, "");
const pick = (obj, kind) => {
  for (const key of Object.keys(obj)) if (KEYS[kind].includes(norm(key))) return key;
  return null;
};

export function mapItems(items, fonte, forced = {}, minItems = 2) {
  const sample = items.find((i) => i && typeof i === "object");
  if (!sample) return null;
  const fields = Object.fromEntries(Object.keys(KEYS).map((k) => [k, forced[k] && forced[k] in sample ? forced[k] : pick(sample, k)]));
  if (!fields.nome) return null;
  const cents = fields.preco && /cent/i.test(fields.preco);
  const mapped = items
    .filter((it) => it && typeof it === "object")
    .map((it) => {
      const raw = fields.preco ? it[fields.preco] : null;
      let preco = typeof raw === "number" ? raw : raw != null ? Number(String(raw).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")) : null;
      if (preco != null && cents) preco /= 100;
      const nome = [fields.marca ? it[fields.marca] : "", it[fields.nome]].filter((v) => typeof v === "string" && v.trim()).join(" ");
      return {
        id: fields.id ? String(it[fields.id] ?? "") : "",
        nome,
        categoria: fields.categoria && typeof it[fields.categoria] === "string" ? it[fields.categoria] : "",
        preco: Number.isFinite(preco) ? preco : null,
        descricao: fields.descricao && typeof it[fields.descricao] === "string" ? it[fields.descricao] : "",
        imagem: fields.imagem && typeof it[fields.imagem] === "string" ? it[fields.imagem] : "",
        link: fields.link && typeof it[fields.link] === "string" ? it[fields.link] : "",
        tags: fields.tags && Array.isArray(it[fields.tags]) ? it[fields.tags].filter((t) => typeof t === "string") : [],
      };
    })
    .filter((i) => i.nome);
  if (mapped.length < minItems) return null;
  return { fonte, campos: fields, total: mapped.length, itens: mapped };
}
