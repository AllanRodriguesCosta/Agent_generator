// Versão 0.6: leitura de um site já publicado, pela URL, sem acesso ao código.
// Só lê o que é público: respeita o robots.txt, se identifica, faz pausas entre as páginas e
// nunca entra em áreas de conta, carrinho, checkout ou administração. O resultado vira um
// "espelho" em disco que o raio X normal lê como se fosse o projeto.
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { parseMarkup, textOf } from "../scanner/html.js";
import { mapItems } from "../agent/catalog-map.js";

export const USER_AGENT = "agent-generator/0.6 (+https://github.com/AllanRodriguesCosta/Agent_generator)";
// Caminhos que nunca são lidos: área logada, ações e administração.
export const PRIVATE_PATH = /\/(admin|wp-admin|wp-login(?:\.php)?|login|logout|sair|entrar|cadastro|register|signup|conta|minha-conta|account|my-account|carrinho|cart|checkout|pagamento|payment|pedidos?|orders?|perfil|profile)(?:[/.]|$)|\/api\/(?!products|produtos|catalogo|catalog)/i;
const ASSET = /\.(png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|map|json|xml|txt|pdf|zip|mp4|mp3|woff2?|ttf|eot)$/i;
// Listas públicas de produtos de plataformas conhecidas e caminhos comuns de API.
export const CATALOG_PROBES = ["/api/products", "/api/produtos", "/api/catalogo", "/api/catalog", "/products.json", "/wp-json/wc/store/v1/products?per_page=100"];

// robots.txt: regras do grupo "*" (ou do agent-generator), com * e $ e a regra mais longa vencendo.
export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  const sitemaps = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [], delay: 0 };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "disallow" || key === "allow") {
      if (value || key === "allow") current.rules.push({ allow: key === "allow", path: value });
    } else if (key === "crawl-delay") current.delay = Math.min(10, Number(value) || 0);
  }
  const mine = groups.find((g) => g.agents.some((a) => a !== "*" && "agent-generator".startsWith(a))) || groups.find((g) => g.agents.includes("*"));
  const rules = (mine?.rules || []).filter((r) => r.path).map((r) => ({ ...r, re: new RegExp(`^${r.path.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}`) }));
  return {
    sitemaps,
    delayMs: (mine?.delay || 0) * 1000,
    allowed(path) {
      let best = null;
      for (const r of rules) if (r.re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
      return !best || best.allow;
    },
  };
}

export const sitemapLocs = (xml) => [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&"));

const first = (v) => (Array.isArray(v) ? v[0] : v);
const textValue = (v) => (typeof v === "string" ? v : typeof v?.name === "string" ? v.name : typeof v?.["@id"] === "string" ? "" : "");
const pathOf = (url, base) => {
  try {
    const u = new URL(url, base);
    return u.origin === new URL(base).origin ? `${u.pathname}${u.search}` : "";
  } catch {
    return "";
  }
};

// Produtos marcados com schema.org (JSON-LD) na página: Product, ItemList de Product e @graph.
export function productsFromJsonLd(html, pageUrl) {
  const origin = new URL(pageUrl).origin;
  const out = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (Array.isArray(node["@graph"])) node["@graph"].forEach(visit);
    if (Array.isArray(node.itemListElement)) node.itemListElement.forEach((e) => visit(e?.item || e));
    const types = [].concat(node["@type"] || []);
    if (!types.includes("Product") || typeof node.name !== "string") return;
    const offer = first(node.offers) || {};
    const price = offer.price ?? offer.lowPrice ?? first(offer.offers)?.price;
    const marca = textValue(first(node.brand));
    const nome = textOf(node.name);
    const image = first(node.image);
    out.push({
      id: String(node.sku || node.productID || node.mpn || ""),
      nome: marca && nome.toLowerCase().startsWith(marca.toLowerCase()) ? nome : [marca, nome].filter(Boolean).join(" "),
      categoria: textValue(node.category) || "",
      preco: price != null && Number.isFinite(Number(price)) ? Number(price) : null,
      descricao: textOf(node.description || "").slice(0, 400),
      imagem: typeof image === "string" ? image : image?.url || "",
      link: pathOf(node.url || offer.url || pageUrl, origin) || pathOf(pageUrl, origin),
    });
  };
  for (const m of String(html).matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1]));
    } catch {
      /* JSON-LD inválido: ignora */
    }
  }
  return out;
}

// Respostas de APIs de catálogo conhecidas (Shopify e WooCommerce) e listas genéricas.
export function productsFromApi(path, data) {
  if (path.startsWith("/products.json") && Array.isArray(data?.products))
    return data.products.map((p) => ({
      id: String(p.id ?? p.handle ?? ""),
      nome: textOf(p.title || ""),
      marca: p.vendor || "",
      categoria: p.product_type || "",
      preco: Number(first(p.variants)?.price) || null,
      descricao: textOf(p.body_html || "").slice(0, 400),
      imagem: first(p.images)?.src || "",
      link: `/products/${p.handle}`,
    }));
  if (path.startsWith("/wp-json/wc/store") && Array.isArray(data))
    return data.map((p) => {
      const minor = Number(p.prices?.currency_minor_unit ?? 2);
      return {
        id: String(p.id ?? ""),
        nome: textOf(p.name || ""),
        categoria: first(p.categories)?.name || "",
        preco: p.prices?.price != null ? Number(p.prices.price) / 10 ** minor : null,
        descricao: textOf(p.short_description || p.description || "").slice(0, 400),
        imagem: first(p.images)?.src || "",
        link: p.permalink ? pathOf(p.permalink, new URL(p.permalink).origin) : "",
      };
    });
  const list = Array.isArray(data) ? data : ["data", "items", "itens", "produtos", "products", "results"].map((k) => data?.[k]).find(Array.isArray);
  return list ? mapItems(list, path, {}, 2)?.itens || [] : [];
}

const isSpa = (html, page) => textOf(html).length < 250 && /<div[^>]+id=["'](root|app|__next|__nuxt)["']/i.test(html) && page.headings.length < 2;

// Lê o site. "render" (opcional) troca o fetch de HTML por um navegador (sites feitos só em JS).
// Páginas de produto (mesmo caminho com ?id=... e JSON-LD de Product) têm cota própria
// (maxProductPages), para o catálogo inteiro caber sem tirar espaço das páginas de conteúdo.
export async function crawlSite(start, { maxPages = 60, maxProductPages = 400, delayMs = 400, timeoutMs = 10000, fetchImpl = fetch, render, log = () => {} } = {}) {
  const startUrl = new URL(/^https?:\/\//i.test(start) ? start : `https://${start}`);
  if (!/^https?:$/.test(startUrl.protocol)) throw new Error("Use um endereço http:// ou https://.");
  const origin = startUrl.origin;
  const avisos = [];
  const get = async (path, accept) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(new URL(path, origin), { headers: { "user-agent": USER_AGENT, accept }, redirect: "follow", signal: controller.signal });
      const finalOrigin = res.url ? new URL(res.url).origin : origin;
      if (finalOrigin !== origin) return { status: 0, foreign: true };
      return { status: res.status, ok: res.ok, type: res.headers?.get?.("content-type") || "", csp: res.headers?.get?.("content-security-policy") || "", body: res.ok ? (await res.text()).slice(0, 2_000_000) : "" };
    } catch {
      return { status: 0 };
    } finally {
      clearTimeout(timer);
    }
  };
  const robotsRes = await get("/robots.txt", "text/plain");
  const robots = parseRobots(robotsRes.ok ? robotsRes.body : "");
  const pause = Math.max(delayMs, robots.delayMs);
  const wait = () => (pause ? new Promise((r) => setTimeout(r, pause)) : null);

  // Fila: página inicial e páginas do sitemap (com índices de sitemap até 5 arquivos).
  const queue = [pathOf(startUrl.href, origin) || "/"];
  const seen = new Set();
  const sitemapFiles = robots.sitemaps.length ? robots.sitemaps.slice(0, 5) : ["/sitemap.xml"];
  for (const file of sitemapFiles) {
    const sm = await get(pathOf(file, origin) || "/sitemap.xml", "application/xml");
    if (!sm.ok) continue;
    const locs = sitemapLocs(sm.body);
    if (/<sitemapindex/i.test(sm.body)) {
      for (const child of locs.slice(0, 5)) {
        const c = await get(pathOf(child, origin), "application/xml");
        if (c.ok) queue.push(...sitemapLocs(c.body).map((u) => pathOf(u, origin)).filter(Boolean));
      }
    } else queue.push(...locs.map((u) => pathOf(u, origin)).filter(Boolean));
  }

  const pages = [];
  const products = [];
  const perPath = new Map();
  const productPaths = new Set();
  let blocked = 0;
  let csp = "";
  let regular = 0;
  let productPages = 0;
  while (queue.length && (regular < maxPages || productPages < maxProductPages)) {
    const path = queue.shift().replace(/#.*$/, "");
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const bare = path.split("?")[0];
    if (PRIVATE_PATH.test(bare) || ASSET.test(bare)) continue;
    if (!robots.allowed(path)) {
      blocked++;
      continue;
    }
    const isProduct = path.includes("?") && productPaths.has(bare);
    if (isProduct ? productPages >= maxProductPages : regular >= maxPages) continue;
    // Mesma página com parâmetros diferentes (filtros de catálogo...): até 10 variações.
    if (!isProduct) {
      perPath.set(bare, (perPath.get(bare) || 0) + 1);
      if (perPath.get(bare) > 10) continue;
    }
    if (pages.length) await wait();
    let html = "";
    if (render) html = await render(new URL(path, origin).href).catch(() => "");
    else {
      const r = await get(path, "text/html");
      if (!r.ok || (r.type && !/html/i.test(r.type))) continue;
      html = r.body;
      if (!pages.length) csp = r.csp || "";
    }
    if (!html) continue;
    const page = parseMarkup(html);
    if (!pages.length && !csp) csp = html.match(/<meta[^>]+http-equiv=["']content-security-policy["'][^>]*content=["']([^"']+)["']/i)?.[1] || "";
    pages.push({ path, html });
    log(`  ${path}`);
    const found = productsFromJsonLd(html, new URL(path, origin).href);
    products.push(...found);
    if (found.length === 1 && path.includes("?")) productPaths.add(bare);
    if (isProduct || (found.length === 1 && path.includes("?"))) productPages++;
    else regular++;
    if (pages.length === 1 && !render && isSpa(html, page))
      avisos.push("A página inicial quase não tem texto no HTML (site montado por JavaScript). Rode de novo com --navegador para ler as páginas como o visitante vê (precisa do Playwright).");
    for (const l of page.links) {
      const p = pathOf(l.href, new URL(path, origin).href);
      if (p && !seen.has(p.replace(/#.*$/, ""))) queue.push(p);
    }
  }
  if (blocked) avisos.push(`${blocked} página(s) bloqueadas pelo robots.txt não foram lidas.`);

  // Catálogo por API pública (quando o robots.txt permite). A primeira que responder vale.
  let catalogApi = "";
  for (const probe of CATALOG_PROBES) {
    if (!robots.allowed(probe)) continue;
    const r = await get(probe, "application/json");
    if (!r.ok || !/json/i.test(r.type || "json")) continue;
    let data;
    try {
      data = JSON.parse(r.body);
    } catch {
      continue;
    }
    const items = productsFromApi(probe, data).filter((i) => i.nome);
    if (items.length >= 2) {
      catalogApi = probe;
      products.unshift(...items);
      break;
    }
  }
  const unique = [];
  const keys = new Set();
  for (const p of products) {
    const k = (p.id || p.link || p.nome).toLowerCase();
    if (!p.nome || keys.has(k)) continue;
    keys.add(k);
    unique.push(p);
  }
  if (!pages.length) avisos.push("Nenhuma página pôde ser lida. Confira o endereço, se o site está no ar e se o robots.txt permite.");
  return { origin, pages, products: unique.slice(0, 2000), catalogApi, avisos, csp, robots: { sitemaps: robots.sitemaps, bloqueadas: blocked } };
}

// O site tem Content-Security-Policy? Diz o que acrescentar para o widget de outro endereço
// carregar (script, CSS e a conversa com o serviço). Sem CSP, nada a fazer.
export function cspAdvice(csp, service = "https://SEU-SERVICO") {
  if (!csp) return "";
  const dirs = Object.fromEntries(
    csp
      .split(";")
      .map((d) => d.trim().split(/\s+/))
      .filter((d) => d[0])
      .map(([k, ...v]) => [k.toLowerCase(), v]),
  );
  const allows = (name) => {
    const v = dirs[name] || dirs["default-src"];
    return !v || v.includes("*") || v.includes(service) || (v.includes("https:") && service.startsWith("https:"));
  };
  const need = ["script-src", "style-src", "connect-src"].filter((d) => !allows(d));
  return need.length ? `O site usa Content-Security-Policy: acrescente ${service} em ${need.join(", ")} (no cabeçalho ou na meta tag), senão o navegador bloqueia o widget.` : "";
}

// Caminho do site -> arquivo do espelho ("/" -> index.html, "/sobre" -> sobre/index.html).
export function mirrorFile(path) {
  const [bare, query] = path.split("?");
  const segs = decodeURIComponent(bare)
    .split("/")
    .filter(Boolean)
    .map((s) => s.replace(/[^\w.-]/g, "_").replace(/^\.+/, "_"));
  let rel = segs.join("/");
  if (!rel || bare.endsWith("/")) rel = `${rel ? `${rel}/` : ""}index.html`;
  else if (!/\.html?$/i.test(rel)) rel = `${rel}/index.html`;
  if (query) rel = rel.replace(/\.html?$/i, `__${query.replace(/[^\w=-]/g, "_").slice(0, 60)}.html`);
  return rel;
}

// Grava o espelho: uma página por caminho (sem as variações de parâmetro, que só alimentam o
// catálogo), o catálogo encontrado e o mapa arquivo -> caminho original.
export async function writeMirror(dir, crawl) {
  const map = {};
  const byPath = new Set();
  for (const p of crawl.pages) {
    const bare = p.path.split("?")[0];
    if (p.path.includes("?") && byPath.has(bare)) continue;
    byPath.add(bare);
    const rel = mirrorFile(p.path.includes("?") ? bare : p.path);
    if (map[rel]) continue;
    await mkdir(dirname(join(dir, rel)), { recursive: true });
    await writeFile(join(dir, rel), p.html);
    map[rel] = p.path.includes("?") ? bare : p.path;
  }
  if (crawl.products.length) await writeFile(join(dir, "catalogo-site.json"), `${JSON.stringify(crawl.products, null, 2)}\n`);
  return map;
}
