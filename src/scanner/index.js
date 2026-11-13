// Raio X do projeto: lê a pasta e monta um relatório com o que o agente precisa saber — nome e
// tipo do projeto, páginas, rotas, formulários, perguntas frequentes dos documentos, catálogo
// (JSON/CSV) e formas de contato. Só leitura: nada no projeto é alterado.
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { listFiles } from "./walk.js";
import { parseMarkup } from "./html.js";
import { parseMarkdown } from "./docs.js";
import { routesFromSource, routeFromFile } from "./routes.js";
import { catalogFromJson, catalogFromCsv } from "./data.js";
import { contactsFrom } from "./contacts.js";
import { pagesFromSitemap, titleFromPath, LOCALE_FILE, readLocale, nextMetadata, errorMessages } from "./extras.js";
import { tokens, STOPWORDS } from "../agent/text.js";

export const REPORT_VERSION = 1;
const CONFIG_JSON = /(^|\/)(package|tsconfig|jsconfig|composer|manifest|vercel|netlify|firebase|app|angular|nest-cli|babel|\.?eslintrc|\.?prettierrc|renovate|lerna|turbo|deno|bower)(\.[\w-]+)?\.json$|(^|\/)(locales?|i18n|lang|translations?)\//i;
const STATIC_PREFIX = /^(public|static|www|wwwroot|site|src\/public|htdocs|html)\//;
const MARKUP = new Set([".html", ".htm", ".jsx", ".tsx", ".vue", ".svelte", ".astro", ".php", ".erb", ".ejs", ".hbs", ".njk", ".liquid"]);
const SOURCE = new Set([".js", ".mjs", ".cjs", ".ts", ".jsx", ".tsx", ".vue", ".py", ".php"]);

const STACKS = [
  ["next", "Next.js"], ["nuxt", "Nuxt"], ["@sveltejs/kit", "SvelteKit"], ["astro", "Astro"], ["react", "React"], ["vue", "Vue"],
  ["@angular/core", "Angular"], ["svelte", "Svelte"], ["vite", "Vite"], ["express", "Express"], ["fastify", "Fastify"], ["koa", "Koa"],
  ["@nestjs/core", "NestJS"], ["@supabase/supabase-js", "Supabase"], ["firebase", "Firebase"], ["prisma", "Prisma"], ["mongoose", "MongoDB"], ["pg", "PostgreSQL"],
];

function hrefFor(rel) {
  const path = rel.replace(STATIC_PREFIX, "");
  if (/(^|\/)index\.html?$/.test(path)) return `/${path.replace(/index\.html?$/, "")}`;
  return `/${path}`;
}

const PT = /\b(de|para|com|não|você|seu|sua|uma|são|também|até|está|página|contato|entrar)\b/gi;
const EN = /\b(the|and|with|your|you|for|are|page|contact|sign|this|that)\b/gi;

export async function scanProject(root, { maxFiles } = {}) {
  const dir = resolve(root);
  const { files, skipped } = await listFiles(dir, { maxFiles });
  const report = {
    versao: REPORT_VERSION,
    gerador: "agent-generator",
    geradoEm: new Date().toISOString(),
    projeto: { nome: basename(dir), descricao: "", stack: [], idioma: "pt-BR" },
    resumo: {},
    paginas: [],
    links: [],
    rotas: [],
    formularios: [],
    faq: [],
    documentos: [],
    catalogo: null,
    outrosCatalogos: [],
    contatos: {},
    mensagensErro: [],
    traducoes: [],
    palavrasChave: [],
    avisos: [],
  };
  const visible = [];
  const linkCount = new Map();
  const catalogs = [];
  const stack = new Set();
  const mounts = new Set();
  const linkModels = new Map();
  const sitemap = [];

  for (const file of files) {
    let content;
    try {
      content = await readFile(file.path, "utf8");
    } catch {
      continue;
    }
    const { rel, ext } = file;
    if (rel === "package.json") {
      try {
        const pkg = JSON.parse(content);
        if (pkg.name) report.projeto.nome = String(pkg.name);
        if (pkg.description) report.projeto.descricao = String(pkg.description);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        for (const [dep, label] of STACKS) if (deps[dep]) stack.add(label);
      } catch {
        report.avisos.push("package.json inválido.");
      }
      continue;
    }
    if (/^requirements.*\.txt$|^pyproject\.toml$/.test(rel)) {
      for (const [dep, label] of [["django", "Django"], ["flask", "Flask"], ["fastapi", "FastAPI"]]) if (content.toLowerCase().includes(dep)) stack.add(label);
      continue;
    }
    // Versão 0.5: sitemap e arquivos de tradução.
    if (/(^|\/)sitemap[\w-]*\.xml$/i.test(rel)) {
      sitemap.push(...pagesFromSitemap(content));
      continue;
    }
    if (ext === ".json" && LOCALE_FILE.test(rel)) {
      const loc = readLocale(content);
      const lang = rel.match(LOCALE_FILE)[3].replace("_", "-");
      if (!report.traducoes.includes(lang)) report.traducoes.push(lang);
      for (const f of loc.faq) report.faq.push({ ...f, fonte: rel });
      visible.push(loc.textos.join("\n"));
      continue;
    }
    if (MARKUP.has(ext)) {
      const page = parseMarkup(content);
      const meta = /\.(jsx|tsx|js|ts)$/.test(ext) ? nextMetadata(content) : null;
      if (meta) {
        page.titulo ||= meta.titulo;
        page.descricao ||= meta.descricao;
      }
      const fileRoute = routeFromFile(rel);
      const isPage = ext === ".html" || ext === ".htm" || fileRoute || (ext === ".php" && /<html|<body|<h1/i.test(content));
      if (isPage) {
        const href = fileRoute || hrefFor(rel);
        const titulo = page.titulo || page.headings.find((h) => h.nivel === 1)?.texto || "";
        if (titulo || page.headings.length)
          report.paginas.push({
            href,
            titulo,
            descricao: page.descricao || page.paragraphs[0]?.slice(0, 200) || "",
            secoes: page.headings.map((h) => h.texto).slice(0, 15),
            arquivo: rel,
          });
        if (page.lang) report.projeto.idioma = page.lang;
        for (const f of page.faq) report.faq.push({ pergunta: f.pergunta, resposta: f.resposta.slice(0, 1000), fonte: rel, link: f.ancora ? `${href}#${f.ancora}` : href });
      }
      for (const l of page.links) {
        const key = `${l.href}|${l.texto}`;
        linkCount.set(key, { href: l.href, texto: l.texto, vezes: (linkCount.get(key)?.vezes || 0) + 1 });
      }
      for (const f of page.forms) if (f.campos.length || f.botao) report.formularios.push({ arquivo: rel, ...f });
      visible.push([page.titulo, page.descricao, ...page.headings.map((h) => h.texto), ...page.paragraphs].join("\n"));
      if (ext === ".html" || ext === ".htm") visible.push(page.texto);
    }
    if (SOURCE.has(ext)) {
      for (const msg of errorMessages(content)) if (!report.mensagensErro.includes(msg) && report.mensagensErro.length < 60) report.mensagensErro.push(msg);
      const found = routesFromSource(content, rel);
      // Rotas de um Router montado com app.use("/api", ...) ganham o prefixo depois.
      if (/\bRouter\(\)|express\.Router|APIRouter|Blueprint\(/.test(content)) for (const r of found) r.roteador = true;
      report.rotas.push(...found);
      for (const m of content.matchAll(/\b(?:app|server)\.use\(\s*["'`](\/[\w/-]+)["'`]\s*,\s*(?!express\.static|compress|cors|json)[\w.]+\(?/g)) mounts.add(m[1]);
      for (const m of content.matchAll(/["'`](\/?[\w/-]*(?:produto|product|item|servico|curso|imovel|detalhe)[\w.-]*\?(?:id|slug|sku)=)/gi)) linkModels.set(m[1], (linkModels.get(m[1]) || 0) + 1);
    }
    if (ext === ".md" || ext === ".mdx" || (ext === ".txt" && /faq|perguntas|ajuda|help/i.test(rel))) {
      const doc = parseMarkdown(content);
      if (/^(changelog|license|licen[cs]a|contributing|code_of_conduct)/i.test(basename(rel))) continue;
      report.documentos.push({ arquivo: rel, titulo: doc.titulo, secoes: doc.secoes.slice(0, 40).map((s) => ({ titulo: s.titulo, texto: s.texto.slice(0, 400) })) });
      for (const f of doc.faq) report.faq.push({ ...f, fonte: rel });
      if (rel.toLowerCase() === "readme.md" && !report.projeto.descricao) {
        const first = doc.secoes[0]?.texto || "";
        report.projeto.descricao = first.slice(0, 300);
      }
      visible.push(doc.secoes.map((s) => `${s.titulo}\n${s.texto}`).join("\n"));
    }
    if (ext === ".json" && !CONFIG_JSON.test(rel)) catalogs.push(...catalogFromJson(content, rel));
    if (ext === ".csv") catalogs.push(...catalogFromCsv(content, rel));
  }

  if (mounts.size === 1) {
    const [prefix] = mounts;
    for (const r of report.rotas)
      if (r.roteador && !r.caminho.startsWith(prefix)) {
        r.caminho = `${prefix}${r.caminho === "/" ? "" : r.caminho}`;
        r.tipo = /^\/api\b/.test(r.caminho) ? "api" : r.tipo;
      }
  }
  for (const r of report.rotas) delete r.roteador;
  const model = [...linkModels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (model) report.linkModelo = `${model.startsWith("/") ? "" : "/"}${model}{id}`;
  // Páginas de rotas de front-end sem arquivo próprio (React Router etc.).
  const known = new Set(report.paginas.map((p) => p.href));
  for (const r of report.rotas)
    if (r.tipo === "pagina" && !known.has(r.caminho) && !r.caminho.includes(":") && !r.caminho.includes("*")) {
      known.add(r.caminho);
      const link = [...linkCount.values()].find((l) => l.href === r.caminho);
      report.paginas.push({ href: r.caminho, titulo: link?.texto || "", descricao: "", secoes: [], arquivo: r.arquivo });
    }
  // Páginas do sitemap.xml que o raio X não achou em arquivo.
  for (const href of sitemap)
    if (!known.has(href)) {
      known.add(href);
      const link = [...linkCount.values()].find((l) => l.href === href);
      report.paginas.push({ href, titulo: link?.texto || titleFromPath(href), descricao: "", secoes: [], arquivo: "sitemap.xml" });
    }
  // Título vazio: usa o texto dos links que apontam para a página.
  for (const p of report.paginas)
    if (!p.titulo) p.titulo = [...linkCount.values()].find((l) => l.href === p.href || `/${l.href.replace(/^\.?\//, "")}` === p.href)?.texto || p.href;

  report.links = [...linkCount.values()].sort((a, b) => b.vezes - a.vezes).slice(0, 80);
  const seenRoutes = new Set();
  report.rotas = report.rotas.filter((r) => {
    const k = `${r.metodo} ${r.caminho}`;
    if (seenRoutes.has(k)) return false;
    seenRoutes.add(k);
    return true;
  }).slice(0, 200);
  catalogs.sort((a, b) => b.total - a.total);
  if (catalogs[0]) report.catalogo = { ...catalogs[0], itens: catalogs[0].itens.slice(0, 500) };
  report.outrosCatalogos = catalogs.slice(1, 6).map(({ fonte, total }) => ({ fonte, total }));
  report.contatos = contactsFrom([...visible, ...report.links.map((l) => l.href)]);
  report.projeto.stack = [...stack];
  if (!report.projeto.stack.length && report.paginas.some((p) => p.arquivo.endsWith(".html"))) report.projeto.stack.push("HTML estático");
  const home = report.paginas.find((p) => p.href === "/") || report.paginas[0];
  if (/^[@\w./-]+$/.test(report.projeto.nome) && home?.titulo) report.projeto.site = home.titulo.split(/\s[|–—-]\s/)[0].trim();
  report.projeto.site ||= report.projeto.nome;
  if (!report.projeto.descricao && home?.descricao) report.projeto.descricao = home.descricao;

  const sample = visible.join(" ").slice(0, 50000);
  if (!/^pt/i.test(report.projeto.idioma) && (sample.match(PT) || []).length > (sample.match(EN) || []).length * 1.5) report.projeto.idioma = "pt-BR";
  if ((sample.match(EN) || []).length > (sample.match(PT) || []).length * 2) report.avisos.push("O site parece estar em inglês; o agente responde em português (traduza os textos gerados se precisar).");

  const freq = new Map();
  for (const t of tokens([...report.paginas.flatMap((p) => [p.titulo, ...p.secoes]), ...report.links.map((l) => l.texto)].join(" ")))
    if (t.length > 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t)) freq.set(t, (freq.get(t) || 0) + 1);
  report.palavrasChave = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([t]) => t);

  report.resumo = {
    arquivosLidos: files.length,
    paginas: report.paginas.length,
    rotas: report.rotas.length,
    formularios: report.formularios.length,
    faq: report.faq.length,
    itensCatalogo: report.catalogo?.total || 0,
    mensagensErro: report.mensagensErro.length,
    traducoes: report.traducoes.length,
    ignorados: skipped,
  };
  if (!report.paginas.length) report.avisos.push("Nenhuma página encontrada (HTML, Next.js, Nuxt, SvelteKit ou rotas de React/Vue). Confira a pasta indicada.");
  if (!report.faq.length) report.avisos.push("Nenhuma pergunta frequente nos documentos. Escreva algumas em agente/conhecimento/faq.json ou use a IA (prompt).");
  if (!report.catalogo) {
    const api = report.rotas.find((r) => r.metodo === "GET" && !r.caminho.includes(":") && /(produt|product|item|servic|curso|course|menu|cardapio|catalog)[a-z]*\/?$/i.test(r.caminho) && r.tipo === "api");
    report.avisos.push(
      api
        ? `Sem catálogo em arquivo, mas há a rota ${api.caminho}: o widget pode ler o catálogo dela (catalogo.url em agente/conhecimento/catalogo.json).`
        : "Nenhum catálogo (lista de produtos ou serviços) em JSON/CSV. Se o site tiver um, exporte para JSON ou configure catalogo.url.",
    );
    if (api) report.catalogoApi = api.caminho;
  }
  if (skipped.segredos) report.avisos.push(`${skipped.segredos} arquivo(s) de segredo (.env, chaves) não foram lidos, de propósito.`);
  if (skipped.limite) report.avisos.push("Projeto grande: só os primeiros arquivos foram lidos (use --max-arquivos).");
  return report;
}
