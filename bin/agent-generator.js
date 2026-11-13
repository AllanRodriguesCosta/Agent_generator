#!/usr/bin/env node
// agent-generator: faz o raio X de um projeto web e cria um agente (chatbot) personalizado para ele.
// Uso: agent-generator <comando> <pasta-do-projeto> [opções]   (ajuda: agent-generator ajuda)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createReadStream, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { stat } from "node:fs/promises";
import { join, resolve, extname, relative, sep } from "node:path";
import { createInterface } from "node:readline/promises";
import { scanProject } from "../src/scanner/index.js";
import { generateKnowledge } from "../src/generator/index.js";
import { buildPrompt, parseAiAnswer, mergeAi, askGemini } from "../src/generator/ai.js";
import { install, detectTarget, injectTags, readKnowledge, writeKnowledge, snippetFor, entryPages } from "../src/installer/index.js";
import { runAssistant } from "../src/cli/assistente.js";
import { evaluateKnowledge, evaluationText } from "../src/eval/index.js";
import { createAgent } from "../src/agent/agent.js";

const ALIASES = { auto: "assistente", wizard: "assistente", create: "criar", scan: "analisar", generate: "gerar", install: "instalar", eval: "avaliar", chat: "conversar", "ai-prompt": "prompt-ia", "ai-apply": "aplicar-ia", serve: "servir", help: "ajuda" };
const WORK = "agente-gerador";

export function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      if (v !== undefined) out.flags[k] = v;
      else if (["destino", "porta", "frases", "modelo", "max-arquivos"].includes(k)) out.flags[k] = argv[++i];
      else out.flags[k] = true;
    } else out._.push(a);
  }
  return out;
}

const HELP = `agent-generator — cria um agente (chatbot) para o seu site a partir do próprio projeto.

Uso: agent-generator <comando> <pasta-do-projeto> [opções]

Comandos:
  assistente [pasta]       Guiado, com perguntas de sim/não: raio X, base, instalação, widget nas
                           páginas, avaliação e teste no navegador. É o que o executável faz
                           com duplo clique. Sem pasta, usa a pasta atual.
  criar <pasta>            Tudo de uma vez: analisar + gerar + instalar + avaliar
  analisar <pasta>         Raio X do projeto (agente-gerador/relatorio.json)
  gerar <pasta>            Cria a base de conhecimento a partir do relatório
  instalar <pasta>         Copia núcleo, widget e base para a pasta pública do site
  avaliar <pasta>          Mostra a porcentagem de acerto da base
  conversar <pasta> [frase...]   Conversa com o agente no terminal
  prompt-ia <pasta>        Escreve agente-gerador/PROMPT-IA.md para colar numa IA de chat
  aplicar-ia <pasta> <arquivo.json>   Junta a resposta da IA à base (com conferência)
  gemini <pasta>           Igual a prompt-ia + aplicar-ia, usando GEMINI_API_KEY (gratuito)
  servir <pasta>           Abre o site estático com o agente em http://localhost:5173
  ajuda                    Esta mensagem

Opções:
  --destino <pasta>   Onde instalar o agente (padrão: detectado, ex.: public/agente)
  --inserir           Insere a linha do widget nos HTML de entrada (index.html...)
  --forcar            Regera a base mesmo se já existir (a anterior vai para agente-gerador/backup)
  --json              Saída em JSON (para IAs de código e scripts)
  --frases <arquivo>  Avaliar também frases próprias: [{"frase": "...", "espera": "faq:id"}]
  --porta <n>         Porta do comando servir (padrão 5173)
  --sim               (assistente) Responde o padrão a todas as perguntas, sem abrir navegador
  --sem-pausa         (assistente) Não espera Enter no final
`;

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function context(projectArg, flags) {
  if (!projectArg) throw new Error("Informe a pasta do projeto. Ex.: agent-generator criar ./meu-site");
  const project = resolve(projectArg);
  const info = await stat(project).catch(() => null);
  if (!info?.isDirectory()) throw new Error(`Pasta não encontrada: ${project}`);
  const work = join(project, WORK);
  const workInfo = await stat(work).catch(() => null);
  if (workInfo && !workInfo.isDirectory())
    throw new Error(`Existe um arquivo chamado "${WORK}" na pasta do projeto, e esse nome é usado pela pasta de trabalho. Renomeie o arquivo (ex.: agente-gerador-linux) e rode de novo.`);
  let config = {};
  try {
    config = await readJson(join(work, "config.json"));
  } catch {
    /* primeira vez */
  }
  return { project, work, config, flags };
}

async function saveConfig(ctx, data) {
  await mkdir(ctx.work, { recursive: true });
  ctx.config = { ...ctx.config, ...data };
  await writeFile(join(ctx.work, "config.json"), `${JSON.stringify(ctx.config, null, 2)}\n`);
}

async function target(ctx, stack) {
  if (ctx.flags.destino) return { dir: resolve(ctx.project, ctx.flags.destino), publicPath: ctx.config.publicPath || "/agente/", why: "--destino" };
  if (ctx.config.destino) return { dir: resolve(ctx.project, ctx.config.destino), publicPath: ctx.config.publicPath, why: "agente-gerador/config.json" };
  return detectTarget(ctx.project, stack);
}

async function cmdAnalisar(ctx) {
  const report = await scanProject(ctx.project, { maxFiles: Number(ctx.flags["max-arquivos"]) || undefined });
  await mkdir(ctx.work, { recursive: true });
  await writeFile(join(ctx.work, "relatorio.json"), `${JSON.stringify(report, null, 2)}\n`);
  return { report, arquivo: join(ctx.work, "relatorio.json") };
}

async function loadReport(ctx) {
  try {
    return await readJson(join(ctx.work, "relatorio.json"));
  } catch {
    return (await cmdAnalisar(ctx)).report;
  }
}

async function backup(ctx, dir) {
  const old = await readKnowledge(dir);
  if (!Object.keys(old).length) return null;
  const file = join(ctx.work, "backup", `conhecimento-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await mkdir(join(ctx.work, "backup"), { recursive: true });
  await writeFile(file, `${JSON.stringify(old, null, 2)}\n`);
  return file;
}

async function cmdGerar(ctx) {
  const report = await loadReport(ctx);
  const t = await target(ctx, report.projeto.stack);
  const { knowledge, notes } = generateKnowledge(report);
  const bkp = ctx.flags.forcar ? await backup(ctx, t.dir) : null;
  const { written, kept } = await writeKnowledge(t.dir, knowledge, { force: Boolean(ctx.flags.forcar) });
  await saveConfig(ctx, { destino: relative(ctx.project, t.dir).split(sep).join("/"), publicPath: t.publicPath });
  await writeFile(join(ctx.work, "PROMPT-IA.md"), buildPrompt(report, knowledge));
  return { report, knowledge, notes, target: t, written, kept, backup: bkp };
}

async function cmdInstalar(ctx, { report } = {}) {
  const r = report || (await loadReport(ctx));
  const t = await target(ctx, r.projeto.stack);
  const existing = await readKnowledge(t.dir);
  const knowledge = Object.keys(existing).length ? null : generateKnowledge(r).knowledge;
  const result = await install(ctx.project, knowledge, { target: t, stack: r.projeto.stack });
  await saveConfig(ctx, { destino: relative(ctx.project, t.dir).split(sep).join("/"), publicPath: t.publicPath });
  const injected = ctx.flags.inserir ? await injectTags(ctx.project, t.publicPath) : null;
  return { ...result, injected };
}

async function currentKnowledge(ctx) {
  const report = await loadReport(ctx);
  const t = await target(ctx, report.projeto.stack);
  const raw = await readKnowledge(t.dir);
  if (!Object.keys(raw).length) throw new Error(`Base não encontrada em ${t.dir}. Rode antes: agent-generator criar ${ctx.project}`);
  return { raw, target: t, report };
}

async function cmdAvaliar(ctx) {
  const { raw } = await currentKnowledge(ctx);
  const extra = ctx.flags.frases ? await readJson(resolve(ctx.flags.frases)) : [];
  const result = evaluateKnowledge(raw, { extra });
  await writeFile(join(ctx.work, "avaliacao.txt"), `${evaluationText(result)}\n`);
  return result;
}

async function cmdConversar(ctx, phrases, sharedRl = null) {
  const { raw } = await currentKnowledge(ctx);
  const agent = createAgent(raw);
  const show = (r) => {
    const lines = [`agente: ${r.texto}`];
    for (const it of r.itens) lines.push(`   • ${it.nome}${it.precoTexto ? ` — ${it.precoTexto}` : ""}${it.link ? ` (${it.link})` : ""}`);
    for (const a of r.acoes) lines.push(`   [${a.rotulo}] ${a.href}`);
    if (r.sugestoes.length) lines.push(`   sugestões: ${r.sugestoes.join(" | ")}`);
    lines.push(`   (intenção: ${r.intencao}, confiança ${r.confianca})`);
    return lines.join("\n");
  };
  let contexto = {};
  if (phrases.length) {
    const out = [];
    for (const p of phrases) {
      const r = agent.reply(p, contexto);
      contexto = r.contexto;
      out.push({ frase: p, ...r });
      if (!ctx.flags.json) console.log(`você: ${p}\n${show(r)}\n`);
    }
    return out;
  }
  console.log(`${agent.saudacao().texto}\n(escreva "sair" para terminar)\n`);
  const rl = sharedRl || createInterface({ input: process.stdin, output: process.stdout });
  for (;;) {
    const line = await rl.question("você: ");
    if (/^(sair|exit|quit)$/i.test(line.trim())) break;
    const r = agent.reply(line, contexto);
    contexto = r.contexto;
    console.log(`${show(r)}\n`);
  }
  if (!sharedRl) rl.close();
  return null;
}

async function cmdAplicarIa(ctx, file, text) {
  const { raw, target: t } = await currentKnowledge(ctx);
  const suggestion = parseAiAnswer(text ?? (await readFile(resolve(file), "utf8")));
  const { knowledge, changes, problems } = mergeAi(createAgent(raw).knowledge, suggestion);
  const bkp = await backup(ctx, t.dir);
  await writeKnowledge(t.dir, knowledge, { force: true });
  return { changes, problems, backup: bkp, avaliacao: evaluateKnowledge(knowledge).geral };
}

async function cmdGemini(ctx) {
  const { raw, report } = await currentKnowledge(ctx);
  const prompt = buildPrompt(report, createAgent(raw).knowledge);
  const text = await askGemini(prompt, { apiKey: process.env.GEMINI_API_KEY, model: ctx.flags.modelo || process.env.GEMINI_MODEL || undefined });
  await writeFile(join(ctx.work, "resposta-gemini.json"), text);
  return cmdAplicarIa(ctx, null, text);
}

// Sobe o servidor estático na porta pedida ou na próxima livre (até +10).
async function listenFree(server, port) {
  for (let p = port; p <= port + 10; p++) {
    const ok = await new Promise((done) => {
      server.once("error", () => done(false));
      server.listen(p, "127.0.0.1", () => done(true));
    });
    if (ok) return p;
  }
  throw new Error(`Portas ${port} a ${port + 10} ocupadas. Use --porta.`);
}

async function cmdAssistente(ctx) {
  const interactive = Boolean(process.stdin.isTTY) && !ctx.flags.sim;
  const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  const io = {
    print: (text) => console.log(text),
    async ask(question, fallback, { soInterativo = false } = {}) {
      const hint = fallback ? "[S/n]" : "[s/N]";
      if (!rl) {
        const value = soInterativo ? false : fallback;
        console.log(`${question} ${hint} ${value ? "sim" : "não"} (automático)`);
        return value;
      }
      const answer = (await rl.question(`${question} ${hint} `)).trim().toLowerCase();
      return answer ? /^(s|sim|y|yes)/.test(answer) : fallback;
    },
    async pause() {
      if (rl && !ctx.flags["sem-pausa"]) await rl.question("\nPressione Enter para fechar...");
      rl?.close();
    },
  };
  const steps = {
    analisar: async () => (await cmdAnalisar(ctx)).report,
    target: (report) => target(ctx, report.projeto.stack),
    gerar: ({ force }) => {
      ctx.flags.forcar = force;
      return cmdGerar(ctx);
    },
    instalar: ({ report }) => {
      ctx.flags.inserir = false;
      return cmdInstalar(ctx, { report });
    },
    entryPages: () => entryPages(ctx.project),
    inject: (backupDir, publicPath) => injectTags(ctx.project, publicPath, { backupDir }),
    avaliar: () => cmdAvaliar(ctx),
    gemini: () => cmdGemini(ctx),
    conversar: () => cmdConversar(ctx, [], rl),
    async servir(root) {
      const port = await listenFree(staticServer(root), Number(ctx.flags.porta) || 5173);
      return `http://localhost:${port}/`;
    },
  };
  const result = await runAssistant({ project: ctx.project, work: ctx.work, io, steps, hasGemini: Boolean(process.env.GEMINI_API_KEY) });
  if (result.status === "servindo") rl?.close();
  return result;
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8" };

// Servidor estático simples (só leitura, só dentro da pasta) para ver o agente num site HTML.
export function staticServer(rootDir) {
  const root = resolve(rootDir);
  return createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      let file = resolve(root, `.${path}`);
      if (file !== root && !file.startsWith(root + sep)) throw Object.assign(new Error("fora"), { code: "ENOENT" });
      let info = await stat(file);
      if (info.isDirectory()) {
        file = join(file, "index.html");
        info = await stat(file);
      }
      res.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store", "x-content-type-options": "nosniff" });
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Não encontrado");
    }
  });
}

function print(ctx, value, text) {
  if (ctx?.flags?.json) console.log(JSON.stringify(value, null, 2));
  else if (text) console.log(text);
}

const summary = (r) =>
  `Raio X de "${r.projeto.site}" (${r.projeto.stack.join(", ") || "tipo não identificado"}): ${r.resumo.paginas} páginas, ${r.resumo.rotas} rotas, ${r.resumo.formularios} formulários, ${r.resumo.faq} perguntas frequentes, ${r.resumo.itensCatalogo} itens de catálogo.`;
const notesText = (notes) => (notes.length ? `\nAvisos:\n${notes.map((n) => `- ${n}`).join("\n")}` : "");

export async function main(argv = process.argv.slice(2)) {
  const { _, flags } = parseArgs(argv);
  const command = ALIASES[_[0]] || _[0];
  if (!command || command === "ajuda" || flags.help || flags.ajuda) {
    console.log(HELP);
    return 0;
  }
  const ctx = await context(command === "assistente" ? _[1] || process.cwd() : _[1], flags);
  switch (command) {
    case "assistente": {
      const r = await cmdAssistente(ctx);
      if (flags.json) console.log(JSON.stringify(r, null, 2));
      return r.status === "servindo" ? null : 0;
    }
    case "analisar": {
      const { report, arquivo } = await cmdAnalisar(ctx);
      print(ctx, report, `${summary(report)}\nRelatório: ${arquivo}${notesText(report.avisos)}`);
      return 0;
    }
    case "gerar": {
      const r = await cmdGerar(ctx);
      print(ctx, { destino: r.target.dir, escritos: r.written, mantidos: r.kept, avisos: r.notes, backup: r.backup },
        `Base em ${r.target.dir}/conhecimento (${r.written.length} arquivos novos${r.kept.length ? `, ${r.kept.length} mantidos — use --forcar para regerar` : ""}).\nPrompt para IA de chat: ${join(ctx.work, "PROMPT-IA.md")}${notesText(r.notes)}`);
      return 0;
    }
    case "instalar": {
      const r = await cmdInstalar(ctx);
      print(ctx, r, `Agente instalado em ${r.dir} (${r.why}).\n\n${r.snippet}${r.injected ? `\n\nLinha inserida em: ${r.injected.changed.map((f) => relative(ctx.project, f)).join(", ") || "nenhum arquivo"}${r.injected.skipped.length ? ` (já tinham: ${r.injected.skipped.map((f) => relative(ctx.project, f)).join(", ")})` : ""}` : ""}`);
      return 0;
    }
    case "criar": {
      const { report } = await cmdAnalisar(ctx);
      const g = await cmdGerar(ctx);
      const i = await cmdInstalar(ctx, { report });
      const ev = await cmdAvaliar(ctx);
      print(ctx, { relatorio: report.resumo, destino: i.dir, publicPath: i.publicPath, snippet: i.snippet, inserido: i.injected, avaliacao: ev.porcentagens, geral: ev.geral, avisos: g.notes },
        [
          summary(report),
          `Agente instalado em ${i.dir} (${i.why}).`,
          g.kept.length ? `Base existente mantida (${g.kept.length} arquivos). Use --forcar para regerar.` : `Base de conhecimento criada em ${i.dir}/conhecimento.`,
          `Acerto da base: ${ev.geral}% (detalhes em ${WORK}/avaliacao.txt).`,
          "",
          i.injected ? `Linha do widget inserida em: ${i.injected.changed.map((f) => relative(ctx.project, f)).join(", ") || "nenhum arquivo novo"}.` : i.snippet,
          "",
          `Próximos passos: teste com "agent-generator conversar ${_[1]}", edite os arquivos de conhecimento e, se quiser, melhore com IA (${WORK}/PROMPT-IA.md).`,
        ].join("\n") + notesText(g.notes));
      return 0;
    }
    case "avaliar": {
      const r = await cmdAvaliar(ctx);
      print(ctx, r, evaluationText(r));
      return r.geral != null && r.geral < 70 ? 2 : 0;
    }
    case "conversar": {
      const r = await cmdConversar(ctx, _.slice(2));
      if (r && flags.json) console.log(JSON.stringify(r, null, 2));
      return 0;
    }
    case "prompt-ia": {
      const { raw, report } = await currentKnowledge(ctx);
      const file = join(ctx.work, "PROMPT-IA.md");
      await writeFile(file, buildPrompt(report, createAgent(raw).knowledge));
      print(ctx, { arquivo: file }, `Prompt pronto: ${file}\nCole o conteúdo numa IA de chat, salve a resposta (só o JSON) num arquivo e rode:\n  agent-generator aplicar-ia ${_[1]} resposta.json`);
      return 0;
    }
    case "aplicar-ia": {
      if (!_[2]) throw new Error("Informe o arquivo com a resposta da IA. Ex.: agent-generator aplicar-ia ./meu-site resposta.json");
      const r = await cmdAplicarIa(ctx, _[2]);
      print(ctx, r, `IA aplicada: +${r.changes.exemplos} exemplos, ${r.changes.intencoesNovas.length} intenções novas, +${r.changes.faqNovas} perguntas, ${r.changes.paginas} páginas com termos novos.\nAcerto da base: ${r.avaliacao}%. Backup da base anterior: ${r.backup}${notesText([...r.changes.ignorados, ...r.problems])}`);
      return 0;
    }
    case "gemini": {
      const r = await cmdGemini(ctx);
      print(ctx, r, `Gemini aplicado: +${r.changes.exemplos} exemplos, ${r.changes.intencoesNovas.length} intenções novas, +${r.changes.faqNovas} perguntas. Acerto: ${r.avaliacao}%.${notesText(r.changes.ignorados)}`);
      return 0;
    }
    case "servir": {
      const port = Number(flags.porta) || 5173;
      const server = staticServer(ctx.project);
      await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
      const t = await target(ctx, (await loadReport(ctx)).projeto.stack);
      console.log(`Site em http://localhost:${port} (Ctrl+C para parar). O agente aparece nas páginas que têm a linha do widget.\n${snippetFor(t.publicPath)}`);
      return null;
    }
    default:
      throw new Error(`Comando desconhecido: ${_[0]}. Veja: agent-generator ajuda`);
  }
}

const isMain = (() => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();
if (isMain)
  main().then(
    (code) => {
      if (code != null) process.exitCode = code;
    },
    (error) => {
      console.error(`Erro: ${error.message}`);
      process.exitCode = 1;
    },
  );
