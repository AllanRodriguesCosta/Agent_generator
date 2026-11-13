// Instala o agente no projeto: copia o núcleo, o widget e a base de conhecimento para a pasta
// pública do site e mostra (ou insere, se pedido) a linha que liga o widget nas páginas.
// A base já existente nunca é sobrescrita sem --forcar: ela pode ter sido editada à mão.
import { mkdir, readFile, writeFile, copyFile, access, readdir } from "node:fs/promises";
import { join, resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const CORE_FILES = ["text.js", "classifier.js", "search.js", "knowledge.js", "agent.js", "catalog-map.js"];
export const KNOWLEDGE_FILES = ["agente", "intencoes", "faq", "paginas", "catalogo"];
export const MARKER = "<!-- agente: agent-generator -->";

const exists = async (p) => access(p).then(() => true, () => false);

// Onde o site serve arquivos estáticos, conforme o tipo de projeto.
export async function detectTarget(projectDir, stack = []) {
  const dir = resolve(projectDir);
  const has = (s) => stack.includes(s);
  const pick = (folder, publicPath, why) => ({ dir: join(dir, folder, "agente"), publicPath, why });
  if (has("SvelteKit") && (await exists(join(dir, "static")))) return pick("static", "/agente/", "SvelteKit serve a pasta static/");
  if (await exists(join(dir, "public"))) return pick("public", "/agente/", "a pasta public/ é servida na raiz do site (Vite, Next.js, React, Express...)");
  if (has("Angular") && (await exists(join(dir, "src", "assets")))) return pick(join("src", "assets"), "/assets/agente/", "Angular serve src/assets/");
  if (await exists(join(dir, "static"))) return pick("static", "/agente/", "a pasta static/ é servida na raiz");
  return { dir: join(dir, "agente"), publicPath: "/agente/", why: "site estático: a pasta agente/ fica ao lado do index.html" };
}

export function snippetFor(publicPath, stack = []) {
  const tags = `<link rel="stylesheet" href="${publicPath}widget.css">\n<script type="module" src="${publicPath}widget.js"></script>`;
  if (stack.includes("Next.js"))
    return `Next.js: em app/layout.(js|tsx), dentro de <body>:\n  <link rel="stylesheet" href="${publicPath}widget.css" />\n  <Script type="module" src="${publicPath}widget.js" strategy="afterInteractive" />\n(import Script from "next/script")`;
  return `Cole antes de </body> em cada página (ou no index.html do React/Vue/Vite):\n${tags}`;
}

const json = (v) => `${JSON.stringify(v, null, 2)}\n`;

export async function writeKnowledge(targetDir, knowledge, { force = false } = {}) {
  const dir = join(targetDir, "conhecimento");
  await mkdir(dir, { recursive: true });
  const written = [];
  const kept = [];
  for (const name of KNOWLEDGE_FILES) {
    const file = join(dir, `${name}.json`);
    if (!force && (await exists(file))) {
      kept.push(file);
      continue;
    }
    await writeFile(file, json(knowledge[name]));
    written.push(file);
  }
  return { written, kept };
}

export async function readKnowledge(targetDir) {
  const raw = {};
  for (const name of KNOWLEDGE_FILES) {
    try {
      raw[name] = JSON.parse(await readFile(join(targetDir, "conhecimento", `${name}.json`), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw new Error(`conhecimento/${name}.json inválido: ${error.message}`);
    }
  }
  return raw;
}

function readme(publicPath, snippet) {
  return `# Agente do site (gerado pelo agent-generator)

Esta pasta é servida pelo site. Para ligar o agente: ${snippet.split("\n")[0]}

${snippet}

## O que editar
- conhecimento/agente.json: nome, cor (#hex), saudação, textos fixos e sugestões iniciais.
- conhecimento/faq.json: perguntas e respostas. Use "termos" para sinônimos.
- conhecimento/intencoes.json: frases de exemplo e respostas (saudação, contato, ajuda...).
- conhecimento/paginas.json: páginas do site e os termos que levam a cada uma.
- conhecimento/catalogo.json: itens (ou "url" da API do site que lista os itens).

Depois de editar, confira com: npx agent-generator avaliar <pasta-do-projeto>

## Não editar
- nucleo/ e widget.* são atualizados pelo agent-generator (comando instalar).

Endereço público desta pasta: ${publicPath}
`;
}

export async function install(projectDir, knowledge, { target, force = false, stack = [] } = {}) {
  const t = target || (await detectTarget(projectDir, stack));
  await mkdir(join(t.dir, "nucleo"), { recursive: true });
  for (const f of CORE_FILES) await copyFile(join(ROOT, "src", "agent", f), join(t.dir, "nucleo", f));
  await copyFile(join(ROOT, "widget", "widget.js"), join(t.dir, "widget.js"));
  await copyFile(join(ROOT, "widget", "widget.css"), join(t.dir, "widget.css"));
  await copyFile(join(ROOT, "templates", "servidor.js"), join(t.dir, "servidor.js"));
  const snippet = snippetFor(t.publicPath, stack);
  await writeFile(join(t.dir, "LEIA-ME.md"), readme(t.publicPath, snippet));
  const k = knowledge ? await writeKnowledge(t.dir, knowledge, { force }) : { written: [], kept: [] };
  return { ...t, snippet, ...k, relativo: relative(resolve(projectDir), t.dir).split("\\").join("/") };
}

// Arquivos HTML de entrada onde a linha do widget pode ser inserida automaticamente.
export async function entryPages(projectDir) {
  const dir = resolve(projectDir);
  const found = [];
  for (const f of ["index.html", "public/index.html", "src/index.html"]) if (await exists(join(dir, f))) found.push(join(dir, f));
  // Site estático com várias páginas na raiz.
  if (found.length === 1 && found[0] === join(dir, "index.html")) {
    for (const name of (await readdir(dir)).sort()) if (/\.html?$/i.test(name) && name !== "index.html") found.push(join(dir, name));
  }
  return found;
}

// backupDir (opcional): guarda uma cópia de cada HTML antes de alterar.
export async function injectTags(projectDir, publicPath, { backupDir } = {}) {
  const changed = [];
  const skipped = [];
  for (const file of await entryPages(projectDir)) {
    const html = await readFile(file, "utf8");
    if (html.includes(MARKER) || html.includes(`${publicPath}widget.js`)) {
      skipped.push(file);
      continue;
    }
    const tags = `${MARKER}\n<link rel="stylesheet" href="${publicPath}widget.css">\n<script type="module" src="${publicPath}widget.js"></script>\n`;
    const next = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${tags}</body>`) : `${html}\n${tags}`;
    if (backupDir) {
      const copy = join(backupDir, relative(resolve(projectDir), file));
      await mkdir(dirname(copy), { recursive: true });
      await writeFile(copy, html);
    }
    await writeFile(file, next);
    changed.push(file);
  }
  return { changed, skipped };
}
