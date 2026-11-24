// Versão 0.9: desinstalador. Descobre se o projeto tem um agente criado pelo agent-generator e
// desfaz a instalação: tira a linha do widget das páginas (só o bloco que o instalador colocou),
// apaga a pasta do agente (só se ela tiver a cara de uma pasta criada por ele) e, se pedido, a
// pasta de trabalho agente-gerador/. A base de conhecimento é sempre guardada antes, porque pode
// ter sido treinada à mão.
import { readFile, writeFile, mkdir, rm, stat, readdir } from "node:fs/promises";
import { join, relative, resolve, dirname, sep } from "node:path";
import { listFiles } from "../scanner/walk.js";
import { MARKER, entryPages, readKnowledge, detectTarget } from "./index.js";

const exists = (p) => stat(p).then(() => true, () => false);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SOURCE_EXT = new Set([".html", ".htm", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".vue", ".svelte", ".astro", ".php", ".erb", ".ejs", ".hbs", ".njk", ".liquid", ".py"]);

// O bloco exato que injectTags escreve (marcador + CSS + script), com \n ou \r\n.
function blockPattern(publicPath) {
  const pp = escapeRe(publicPath);
  return new RegExp(`${escapeRe(MARKER)}\\r?\\n<link rel="stylesheet" href="${pp}widget\\.css">\\r?\\n<script type="module" src="${pp}widget\\.js"><\\/script>\\r?\\n`, "g");
}

/** Tira do HTML o bloco do widget. Devolve { html, removido, sobrou } (sobrou = ainda cita o widget). */
export function removeTags(html, publicPath = "/agente/") {
  const next = html.replace(blockPattern(publicPath), "");
  const removido = next !== html;
  const sobrou = next.includes(MARKER) || next.includes(`${publicPath}widget.js`);
  return { html: next, removido, sobrou };
}

// Pasta criada pelo instalador: tem o núcleo, o widget e a base. Outra pasta "agente/" do
// projeto (com outro conteúdo) nunca é apagada.
export async function isAgentDir(dir) {
  return (await exists(join(dir, "widget.js"))) && (await exists(join(dir, "nucleo", "agent.js"))) && (await exists(join(dir, "conhecimento")));
}

async function countFiles(dir) {
  let n = 0;
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) n += e.isDirectory() ? await countFiles(join(dir, e.name)) : 1;
  return n;
}

/**
 * Mapeia o que existe do agente no projeto. config = agente-gerador/config.json (pode faltar).
 * Devolve { instalado, pasta, publicPath, paginas, referencias, trabalho }.
 */
export async function planUninstall(projectDir, { config = {}, work } = {}) {
  const project = resolve(projectDir);
  const rel = (f) => relative(project, f).split(sep).join("/") || ".";
  const candidates = [];
  if (config.destino) candidates.push({ dir: resolve(project, config.destino), publicPath: config.publicPath || "/agente/" });
  for (const stack of [[], ["SvelteKit"], ["Angular"]]) {
    const t = await detectTarget(project, stack);
    candidates.push({ dir: t.dir, publicPath: t.publicPath });
  }
  candidates.push({ dir: join(project, "agente"), publicPath: "/agente/" });
  let found = null;
  // Só pastas dentro do projeto (um config.json editado não leva a apagar nada fora dele).
  for (const c of candidates) if (!found && c.dir.startsWith(project + sep) && (await isAgentDir(c.dir))) found = c;
  const publicPath = found?.publicPath || config.publicPath || "/agente/";
  const pasta = found ? { dir: found.dir, rel: rel(found.dir), arquivos: await countFiles(found.dir) } : null;

  // Páginas com o bloco do instalador (automático) e outros arquivos que citam o widget (manual).
  const paginas = [];
  for (const file of await entryPages(project)) {
    const html = await readFile(file, "utf8");
    if (!html.includes(MARKER) && !html.includes(`${publicPath}widget.js`)) continue;
    const r = removeTags(html, publicPath);
    paginas.push({ file, rel: rel(file), automatico: r.removido && !r.sobrou });
  }
  const seen = new Set(paginas.map((p) => p.file));
  const referencias = [];
  const { files } = await listFiles(project, { maxFiles: 4000 });
  for (const f of files) {
    if (seen.has(f.path) || !SOURCE_EXT.has(f.ext)) continue;
    const text = await readFile(f.path, "utf8").catch(() => "");
    if (text.includes(MARKER) || text.includes(`${publicPath}widget.js`) || text.includes(`${publicPath}widget.css`)) referencias.push(f.rel);
  }
  for (const p of paginas) if (!p.automatico) referencias.push(p.rel);
  const workDir = work || join(project, "agente-gerador");
  const trabalho = { dir: workDir, rel: rel(workDir), existe: await exists(workDir) };
  return {
    instalado: Boolean(pasta) || paginas.length > 0,
    pasta,
    publicPath,
    paginas: paginas.filter((p) => p.automatico).map((p) => p.rel),
    referencias: [...new Set(referencias)].slice(0, 40),
    trabalho,
  };
}

/**
 * Desinstala conforme o plano. opts: { apagarTrabalho, log(texto, pct) }.
 * Devolve { paginas, pastaRemovida, trabalhoRemovido, baseGuardada, pendentes, resumo }.
 */
export async function runUninstall(projectDir, plan, { apagarTrabalho = false, log = () => {}, now = new Date() } = {}) {
  const project = resolve(projectDir);
  const rel = (f) => relative(project, f).split(sep).join("/") || ".";
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const work = plan.trabalho.dir;
  const resumo = [];

  // 1. Base de conhecimento guardada (ela pode ter sido treinada/editada à mão).
  let baseGuardada = null;
  if (plan.pasta) {
    const base = await readKnowledge(plan.pasta.dir).catch(() => ({}));
    if (Object.keys(base).length) {
      baseGuardada = apagarTrabalho ? join(project, `agente-base-${stamp}.json`) : join(work, "backup", `conhecimento-desinstalado-${stamp}.json`);
      await mkdir(dirname(baseGuardada), { recursive: true });
      await writeFile(baseGuardada, `${JSON.stringify(base, null, 2)}\n`);
      log(`Base de conhecimento guardada em ${rel(baseGuardada)}.`, 15);
      resumo.push(`Base de conhecimento guardada em ${rel(baseGuardada)} (dá para reinstalar com ela).`);
    }
  }

  // 2. Linha do widget fora das páginas (cópia de cada página antes, se a pasta de trabalho fica).
  const paginas = [];
  for (const r of plan.paginas) {
    const file = join(project, r);
    const html = await readFile(file, "utf8");
    const out = removeTags(html, plan.publicPath);
    if (!out.removido) continue;
    if (!apagarTrabalho) {
      const copy = join(work, "backup", "html-antes-de-desinstalar", r);
      await mkdir(dirname(copy), { recursive: true });
      await writeFile(copy, html);
    }
    await writeFile(file, out.html);
    paginas.push(r);
  }
  log(paginas.length ? `Linha do widget removida de ${paginas.length} página(s).` : "Nenhuma página tinha a linha do widget.", 45);
  if (paginas.length) resumo.push(`Linha do widget removida de: ${paginas.join(", ")}.`);

  // 3. Pasta do agente (só a que tem a cara de criada pelo instalador).
  let pastaRemovida = null;
  if (plan.pasta && (await isAgentDir(plan.pasta.dir))) {
    await rm(plan.pasta.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    pastaRemovida = plan.pasta.rel;
    log(`Pasta ${plan.pasta.rel}/ apagada (${plan.pasta.arquivos} arquivos).`, 70);
    resumo.push(`Pasta do agente apagada: ${plan.pasta.rel}/.`);
  }

  // 4. Pasta de trabalho: apagada, ou fica com o registro e sem o destino no config.json.
  let trabalhoRemovido = false;
  if (apagarTrabalho && plan.trabalho.existe) {
    await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    trabalhoRemovido = true;
    log(`Pasta de trabalho ${plan.trabalho.rel}/ apagada.`, 85);
    resumo.push(`Pasta de trabalho apagada: ${plan.trabalho.rel}/.`);
  } else if (await exists(work)) {
    const cfgFile = join(work, "config.json");
    try {
      const { destino, publicPath, ...rest } = JSON.parse(await readFile(cfgFile, "utf8"));
      await writeFile(cfgFile, `${JSON.stringify({ ...rest, desinstaladoEm: now.toISOString() }, null, 2)}\n`);
    } catch {
      /* sem config: nada a ajustar */
    }
  }

  const pendentes = plan.referencias;
  if (pendentes.length) resumo.push(`Ainda citam o widget (colado à mão; remova a linha): ${pendentes.join(", ")}.`);
  if (!trabalhoRemovido && (await exists(work))) {
    await writeFile(
      join(work, "DESINSTALACAO.txt"),
      `Agent Generator - desinstalado em ${now.toLocaleString("pt-BR")}\nProjeto: ${project}\n\n${resumo.map((r) => `- ${r}`).join("\n")}\n\nCópias das páginas antes da remoção: ${rel(join(work, "backup", "html-antes-de-desinstalar"))}/\nPara apagar também esta pasta: agent-generator desinstalar --tudo\n`,
    );
  }
  log("Pronto: agente desinstalado.", 100);
  return { paginas, pastaRemovida, trabalhoRemovido, baseGuardada: baseGuardada && rel(baseGuardada), pendentes, resumo };
}
