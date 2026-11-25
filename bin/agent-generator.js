#!/usr/bin/env node
// agent-generator: faz o raio X de um projeto web e cria um agente (chatbot) personalizado para ele.
// Uso: agent-generator <comando> <pasta-do-projeto> [opções]   (ajuda: agent-generator ajuda)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createReadStream, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { stat } from "node:fs/promises";
import { join, resolve, extname, relative, sep, basename } from "node:path";
import { createInterface } from "node:readline/promises";
import { scanProject } from "../src/scanner/index.js";
import { generateKnowledge } from "../src/generator/index.js";
import { buildPrompt, parseAiAnswer, mergeAi, askGemini, askAi } from "../src/generator/ai.js";
import { install, detectTarget, injectTags, readKnowledge, writeKnowledge, snippetFor, entryPages } from "../src/installer/index.js";
import { runAssistant, staticRoot, openBrowser } from "../src/cli/assistente.js";
import { planUninstall, runUninstall } from "../src/installer/uninstall.js";
import { summarize, applyObservation, observationText } from "../src/observe/learn.js";
import { findUpstream, runSession } from "../src/observe/session.js";
import { applyCorrection, trainingBase, trainingText } from "../src/train/apply.js";
import { evaluateKnowledge, evaluationText } from "../src/eval/index.js";
import { evaluationHtml } from "../src/eval/html.js";
import { createAgent } from "../src/agent/agent.js";
import { checkKnowledge, RECURSOS } from "../src/agent/knowledge.js";
import { readMissFiles, groupMisses, suggestFor, learnText, correctionFor } from "../src/learn/misses.js";
import { startEditor } from "../src/editor/server.js";
import { buildFromSite } from "../src/site/index.js";
import { USER_AGENT } from "../src/crawler/index.js";
import { buildDomain, enrichFromObservation, sectorKnowledge, SECTOR_IDS } from "../src/domain/index.js";
import { detectSector, textsFromReport } from "../src/domain/detect.js";
import { withIa } from "../src/agent/ia.js";
import { PROVEDORES } from "../src/ia/provedores.js";
import { readVault } from "../src/ia/cofre.js";
import { LINKS, saveIaKey, startOpenRouter, saveCloudflare, forgetVault, vaultState, localIa, iaResponder, publishFor, removeFor, missesFor, placementKit, readHome } from "../src/publicar/fluxo.js";
import { verifyInstall, startPreview } from "../src/publicar/site.js";
import { serviceName } from "../src/publicar/cloudflare.js";

const ALIASES = { observe: "observar", observacao: "observar", train: "treinar", treino: "treinar", treinador: "treinar", uninstall: "desinstalar", remover: "desinstalar", auto: "assistente", wizard: "assistente", installer: "instalador", gui: "instalador", janela: "instalador", create: "criar", scan: "analisar", generate: "gerar", install: "instalar", eval: "avaliar", chat: "conversar", "ai-prompt": "prompt-ia", "ai-apply": "aplicar-ia", serve: "servir", help: "ajuda" };
const WORK = "agente-gerador";

export function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      if (v !== undefined) out.flags[k] = v;
      else if (["destino", "porta", "frases", "modelo", "max-arquivos", "url", "minutos", "arquivo", "max-paginas", "pausa", "setor", "fonte", "testar", "provedor", "chave", "token", "api", "site"].includes(k)) out.flags[k] = argv[++i];
      else out.flags[k] = true;
    } else out._.push(a);
  }
  return out;
}

const HELP = `agent-generator — cria um agente (chatbot) para o seu site a partir do próprio projeto.

Uso: agent-generator <comando> <pasta-do-projeto> [opções]

Comandos:
  instalador [pasta]       (0.9) Instalador visual: uma janela com as etapas (pasta, raio X,
                           funcionalidades com checkbox, aparência, instalação e teste) e a
                           etapa 2 (treino assistido, observação e editor). É o que o
                           executável "agente-instalador" abre com duplo clique.
  assistente [pasta]       Guiado, com perguntas de sim/não: raio X, base, instalação, widget nas
                           páginas, avaliação e teste no navegador. É o que o executável faz
                           com duplo clique. Sem pasta, usa a pasta atual.
  desinstalar [pasta]      (0.9) Encontra o agente criado aqui e desfaz a instalação: tira a linha
                           do widget das páginas e apaga a pasta do agente (a base é guardada antes
                           em agente-gerador/backup). Pede confirmação; --sim confirma; --tudo
                           apaga também agente-gerador/. O instalador visual oferece o mesmo.
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
  observar [pasta]         Parte 1+: você usa o site por alguns minutos e o agente aprende com isso
                           (páginas de verdade, formulários, busca, login, catálogo da API e
                           consultas da conta, como pedidos). Abre o navegador num endereço local.
  treinar [pasta]          Parte 2: o site abre com o agente em modo treino; você conversa com ele
                           e marca "Certo" ou "Corrigir" em cada resposta. A correção vai para a
                           base na hora (com backup), inclusive conversas em etapas.
  aprender [pasta]         Agrupa as frases que o agente não entendeu no site (faltas.jsonl do
                           modo servidor ou o faltas.json exportado no navegador) e sugere onde
                           encaixar cada uma. Com --aplicar, pergunta grupo a grupo.
  editar [pasta]           Abre o editor da base no navegador (perguntas, intenções, páginas e
                           conversas em etapas), com teste do agente e acerto na hora.
  site <url> [pasta]       Site JÁ PUBLICADO, sem o código: lê as páginas públicas (respeitando o
                           robots.txt), gera a base e cria a pasta agente-servico/, um serviço
                           pequeno para publicar à parte. O site só ganha duas linhas (widget).
                           IA opcional (Gemini, OpenAI ou Ollama local) só reescreve o que o
                           agente não entendeu. Pasta padrão: ./agente-<domínio>.
  ia [pasta]               (0.11) Conecta a IA UMA vez e guarda a chave no cofre do seu usuário
                           (fora do projeto e do git). --provedor openrouter abre o login no
                           navegador e a chave volta sozinha; --provedor gemini testa e guarda a
                           chave do Google AI Studio (--chave ou GEMINI_API_KEY); --provedor openai
                           --api <url> --modelo <m> para Groq, OpenAI, Ollama... --esquecer apaga.
                           Sem opções, mostra o que está conectado (nunca a chave inteira).
  publicar [pasta]         (0.11/0.12) Publica o serviço do agente na SUA conta gratuita da Cloudflare
                           (--token <token> na 1ª vez; o link do token já marca as permissões).
                           Pasta de projeto: a chave da IA fica como segredo no serviço e o agente
                           do site chama o serviço só quando não entende (--site <endereço do site>
                           libera o seu domínio). Pasta do "site <url>": publica o agente inteiro e
                           mostra a linha para colar, o guia por plataforma e o plugin WordPress.
                           --remover apaga o serviço.
  setor [pasta]            Mostra o setor detectado (base comum: glossário e sinônimos em
                           português e inglês) e o ranking com as evidências. Com --setor <id>,
                           troca o setor da base. Setores: ${SECTOR_IDS.join(", ")}.
  perfil [pasta]           (0.8) Respostas com os dados de quem está logado (ex.: "como está a obra
                           do meu apartamento?"), por setor. --fonte /api/minha-conta liga e lê os
                           dados da API do próprio site (só na aba, por 15 min); --ativar liga para
                           o site entregar com agente.identificar({...}); --desativar; --testar
                           usuario.json mostra as respostas com dados de exemplo. Lista as galerias.
  ajuda                    Esta mensagem

Opções:
  --destino <pasta>   Onde instalar o agente (padrão: detectado, ex.: public/agente)
  --inserir           Insere a linha do widget nos HTML de entrada (index.html...)
  --setor <id>        (gerar/criar/setor/site) Usa esse setor em vez do detectado ("geral" = nenhum)
  --forcar            Regera a base mesmo se já existir (a anterior vai para agente-gerador/backup)
  --json              Saída em JSON (para IAs de código e scripts)
  --frases <arquivo>  Avaliar também frases próprias: [{"frase": "...", "espera": "faq:id"}]
  --variacoes         (avaliar) Testa também variações geradas: sem acento, erro de digitação, informal
  --html              (avaliar) Grava agente-gerador/avaliacao.html (relatório para abrir no navegador)
  --porta <n>         Porta do comando servir (padrão 5173)
  --tudo              (desinstalar) Apaga também a pasta de trabalho agente-gerador/
  --janela            (instalador) Sem terminal: encerra sozinho 3 min depois que a janela fecha
  --sim               (assistente) Responde o padrão a todas as perguntas, sem abrir navegador
  --sem-pausa         (assistente) Não espera Enter no final
  --url <endereço>    (observar/treinar) Site já rodando, ex.: http://localhost:3000
  --minutos <n>       (observar/treinar) Tempo máximo da sessão (padrão 5 e 30)
  --sem-navegador     (observar/treinar/editar) Não abre o navegador sozinho
  --arquivo <arq>     (aprender) Arquivo com as frases (JSON ou JSON Lines)
  --aplicar           (aprender) Aplica as sugestões, com confirmação (com --sim, só as seguras)
  --max-paginas <n>   (site) Máximo de páginas lidas (padrão 60)
  --pausa <ms>        (site) Pausa entre páginas (padrão 400; o robots.txt pode pedir mais)
  --navegador         (site) Lê as páginas num navegador (sites feitos só em JavaScript; precisa do Playwright)
  --so-conteudo       (site) Atualiza só páginas e catálogo, mantendo as edições da base
  --sim               (site) Confirma que o site é seu ou que você tem autorização para lê-lo
  --provedor <id>     (ia) gemini, openrouter ou openai (compatível: Groq, OpenAI, Ollama...)
  --chave <chave>     (ia) A chave (melhor: variável GEMINI_API_KEY/OPENROUTER_API_KEY, fora do histórico)
  --api <url>         (ia) Endereço da API compatível com OpenAI (ex.: http://localhost:11434/v1)
  --esquecer [ia|cloudflare|tudo]  (ia) Apaga do cofre
  --token <token>     (publicar) Token da Cloudflare (fica no cofre; não precisa repetir)
  --site <endereço>   (publicar) Endereço do site no ar (pasta de projeto), para autorizar o domínio
  --remover           (publicar) Apaga o serviço do agente na Cloudflare
  --fonte <caminho>   (perfil) API do próprio site com os dados de quem está logado; liga o perfil
  --ativar / --desativar  (perfil) Liga (o site chama agente.identificar) ou desliga o perfil
  --testar <arq.json> (perfil) Responde os moldes com dados de exemplo, sem rede
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
  const { knowledge, notes } = generateKnowledge(report, { setor: chosenSector(ctx) });
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
  const knowledge = Object.keys(existing).length ? null : generateKnowledge(r, { setor: chosenSector(ctx) }).knowledge;
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

// Setor escolhido à mão (--setor ou o que ficou salvo em agente-gerador/config.json).
function chosenSector(ctx) {
  const id = typeof ctx.flags.setor === "string" ? ctx.flags.setor : ctx.config?.setor;
  if (id && !SECTOR_IDS.includes(id)) throw new Error(`Setor desconhecido: ${id}. Use um destes: ${SECTOR_IDS.join(", ")}.`);
  return id || undefined;
}

// Versão 0.7: setor detectado, ranking com evidências e troca manual (--setor).
// Versão 0.10: texto do site para a lista "fora do escopo" do setor.
const siteTextOf = (report) => {
  const t = textsFromReport(report);
  return [...t.destaque, ...t.corpo].join(" ");
};

async function cmdSetor(ctx) {
  const report = await loadReport(ctx);
  const detection = detectSector(textsFromReport(report));
  const forced = typeof ctx.flags.setor === "string" ? chosenSector(ctx) : null;
  let applied = null;
  if (forced) {
    const t = await target(ctx, report.projeto.stack);
    const setor = sectorKnowledge(detectSector(textsFromReport(report), { forcar: forced }), { siteText: siteTextOf(report) });
    const raw = await readKnowledge(t.dir);
    const bkp = Object.keys(raw).length ? await backup(ctx, t.dir) : null;
    await writeKnowledge(t.dir, { setor }, { force: true });
    await saveConfig(ctx, { setor: forced });
    applied = { setor: setor.id, glossario: setor.glossario.length, backup: bkp };
  }
  const lines = [
    `Setor detectado: ${detection.setor}${detection.secundario ? ` + ${detection.secundario}` : ""} (confiança ${Math.round(detection.confianca * 100)}%).`,
    "Ranking (pontos e principais sinais):",
    ...detection.ranking.slice(0, 6).map((r) => `  ${r.id.padEnd(12)} ${String(r.pontos).padStart(6)}  ${r.evidencias.slice(0, 4).join(", ") || "-"}`),
    applied ? `\nBase atualizada: setor "${applied.setor}" com ${applied.glossario} termos no glossário (conhecimento/setor.json).` : `\nPara trocar: agent-generator setor ${ctx.project} --setor <id>  (${SECTOR_IDS.join(", ")})`,
  ];
  return { detection: { setor: detection.setor, secundario: detection.secundario, confianca: detection.confianca, ranking: detection.ranking.slice(0, 6) }, applied, texto: lines.join("\n") };
}

// Versão 0.8: perfil da pessoa logada. Liga/desliga, aponta a fonte (API do próprio site) e
// testa os moldes com um JSON de exemplo (--testar usuario.json), sem rede.
async function cmdPerfil(ctx) {
  const { raw, target: t } = await currentKnowledge(ctx);
  const { knowledge } = checkKnowledge(raw);
  const perfil = structuredClone(knowledge.perfil);
  const f = ctx.flags;
  let changed = false;
  if (typeof f.fonte === "string") {
    if (/^https?:/i.test(f.fonte) || !f.fonte.startsWith("/")) throw new Error("--fonte precisa ser um caminho do próprio site, ex.: /api/minha-conta");
    perfil.fonte = f.fonte;
    perfil.ativo = true;
    changed = true;
  }
  if (f.ativar) [perfil.ativo, changed] = [true, true];
  if (f.desativar) [perfil.ativo, changed] = [false, true];
  let bkp = null;
  if (changed) {
    bkp = await backup(ctx, t.dir);
    await writeKnowledge(t.dir, { perfil }, { force: true });
  }
  const testes = [];
  if (typeof f.testar === "string") {
    const usuario = await readJson(resolve(f.testar));
    const agent = createAgent({ ...raw, perfil: { ...perfil, ativo: true } });
    for (const q of agent.knowledge.perfil.perguntas) {
      const r = agent.reply(q.exemplos[0], {}, { usuario });
      testes.push({ pergunta: q.exemplos[0], resposta: r.texto, intencao: r.intencao, fotos: (r.imagens || []).map((i) => i.src) });
    }
  }
  const lines = [
    `Perfil do usuário: ${perfil.ativo ? "LIGADO" : "desligado"}${perfil.fonte ? ` (fonte ${perfil.fonte}, guarda ${perfil.validadeMin} min só na aba)` : perfil.ativo ? " (o site entrega os dados com agente.identificar({...}))" : ""}.`,
    `Moldes (${perfil.perguntas.length}): ${perfil.perguntas.map((q) => q.id).join(", ") || "nenhum"}.`,
    `Galerias de fotos: ${knowledge.midias.galerias.length} (${knowledge.midias.galerias.map((g) => g.titulo).slice(0, 6).join(", ")}${knowledge.midias.galerias.length > 6 ? "..." : ""}).`,
    ...(changed ? [`Base atualizada (conhecimento/perfil.json). Backup: ${bkp}`] : []),
    ...(testes.length ? ["", "Teste com os dados de exemplo:", ...testes.map((x) => `  > ${x.pergunta}\n    ${x.resposta}${x.fotos.length ? `\n    [foto] ${x.fotos[0]}` : ""}`)] : []),
    ...(!perfil.ativo ? ["", "Para ligar: agent-generator perfil <pasta> --fonte /api/minha-conta  (ou --ativar, se o site chamar agente.identificar)"] : []),
  ];
  return { perfil: { ativo: perfil.ativo, fonte: perfil.fonte, perguntas: perfil.perguntas.map((q) => q.id) }, galerias: knowledge.midias.galerias.length, testes, backup: bkp, texto: lines.join("\n") };
}

async function cmdAvaliar(ctx) {
  const { raw } = await currentKnowledge(ctx);
  const extra = ctx.flags.frases ? await readJson(resolve(ctx.flags.frases)) : [];
  const result = evaluateKnowledge(raw, { extra, variacoes: Boolean(ctx.flags.variacoes) });
  await writeFile(join(ctx.work, "avaliacao.txt"), `${evaluationText(result)}\n`);
  // Versão 0.5: relatório em HTML (abre no navegador; bom para o portfólio).
  if (ctx.flags.html) await writeFile(join(ctx.work, "avaliacao.html"), evaluationHtml(result, { site: raw.agente?.site || ctx.config.site || "o site" }));
  return result;
}

async function cmdConversar(ctx, phrases, sharedRl = null) {
  const { raw } = await currentKnowledge(ctx);
  const agent = createAgent(raw);
  const show = (r) => {
    const lines = [`agente: ${r.texto}`];
    for (const it of r.itens) lines.push(`   • ${it.nome}${it.precoTexto ? ` — ${it.precoTexto}` : ""}${it.link ? ` (${it.link})` : ""}`);
    for (const a of r.acoes) lines.push(`   [${a.rotulo}] ${a.href}`);
    for (const im of r.imagens || []) lines.push(`   [foto] ${im.src}${im.legenda ? ` (${im.legenda})` : ""}`);
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
  // Versão 0.11: sem GEMINI_API_KEY, usa a IA conectada no instalador (cofre), se houver.
  if (!process.env.GEMINI_API_KEY) {
    const { ia } = await localIa();
    if (ia) return cmdMelhorarIa(ctx, ia);
  }
  const { raw, report } = await currentKnowledge(ctx);
  const prompt = buildPrompt(report, createAgent(raw).knowledge);
  const text = await askGemini(prompt, { apiKey: process.env.GEMINI_API_KEY, model: ctx.flags.modelo || process.env.GEMINI_MODEL || undefined });
  await writeFile(join(ctx.work, "resposta-gemini.json"), text);
  return cmdAplicarIa(ctx, null, text);
}

// Versão 0.11: melhora a base com a IA conectada (Gemini, OpenRouter ou compatível com OpenAI).
async function cmdMelhorarIa(ctx, ia) {
  const { raw, report } = await currentKnowledge(ctx);
  const prompt = buildPrompt(report, createAgent(raw).knowledge);
  const text = await askAi(prompt, ia);
  await writeFile(join(ctx.work, "resposta-ia.json"), text);
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

// Perguntas no terminal: sim/não, texto livre e "espera Enter" (com cancelamento).
function makeIo(ctx, rl) {
  return {
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
    question: rl ? (q) => rl.question(q) : null,
    waitEnter: rl ? (signal) => rl.question("", { signal }) : null,
    async pause() {
      if (rl && !ctx.flags["sem-pausa"]) await rl.question("\nPressione Enter para fechar...");
      rl?.close();
    },
  };
}

async function ensureAgent(ctx) {
  const report = await loadReport(ctx);
  const t = await target(ctx, report.projeto.stack);
  if (!Object.keys(await readKnowledge(t.dir)).length) {
    await cmdGerar(ctx);
    await cmdInstalar(ctx, { report });
  }
  return currentKnowledge(ctx);
}
async function serveStatic(ctx, root) {
  const server = staticServer(root);
  const port = await listenFree(server, Number(ctx.flags.porta) || 5173);
  return { url: `http://localhost:${port}/`, stop: () => server.close() };
}
async function upstreamFor(ctx, io) {
  const root = await staticRoot(ctx.project, await entryPages(ctx.project));
  const up = await findUpstream({ project: ctx.project, flags: ctx.flags, config: ctx.config, io, staticRoot: root, serveStatic: (r) => serveStatic(ctx, r) });
  if (!/estático/.test(up.origem)) await saveConfig(ctx, { url: up.url });
  io.print(`     Site: ${up.url} (${up.origem})`);
  return up;
}
// Junta o que a sessão viu à base (com backup) e salva os relatórios.
async function learnFrom(ctx, session, minutos) {
  const obs = summarize(session);
  const { raw, target: t } = await currentKnowledge(ctx);
  const antes = evaluateKnowledge(raw).geral;
  const applied = applyObservation(raw, obs);
  // Versão 0.7: com o site rodando, o setor é conferido de novo e os formulários usados viram
  // interações (o que dá para fazer no site e onde).
  const enriched = enrichFromObservation(applied.knowledge, obs);
  const knowledge = enriched.knowledge;
  const changes = { ...applied.changes, setor: enriched.changes.setor, interacoes: enriched.changes.interacoes };
  const bkp = await backup(ctx, t.dir);
  await writeKnowledge(t.dir, knowledge, { force: true });
  const geral = evaluateKnowledge(knowledge).geral;
  const slim = { ...obs, listas: obs.listas.map(({ itensMapeados, ...l }) => ({ ...l, itensMapeados: itensMapeados.length })) };
  await writeFile(join(ctx.work, "observacao.json"), `${JSON.stringify({ geradoEm: new Date().toISOString(), motivo: session.motivo, ...slim }, null, 2)}\n`);
  const text = observationText(obs, changes, { minutos });
  await writeFile(join(ctx.work, "OBSERVACAO.txt"), text);
  return { obs, changes, backup: bkp, antes, geral, texto: text };
}

async function cmdObservar(ctx, io) {
  await ensureAgent(ctx);
  io.print("Observação: o Agent Generator fica entre o navegador e o seu site, sem mudar nenhum arquivo do projeto.");
  const up = await upstreamFor(ctx, io);
  const minutos = Number(ctx.flags.minutos) || 5;
  try {
    const session = await runSession({
      upstream: up.url,
      minutos,
      inject: { body: '<script src="/__agente-gerador/gravador.js"></script>' },
      io,
      listenFree,
      open: ctx.flags["sem-navegador"] ? null : openBrowser,
      waitEnter: io.waitEnter,
    });
    io.print(`     Observação encerrada (${session.motivo}). Aprendendo com ${session.events.length} eventos e ${session.exchanges.length} chamadas...`);
    return await learnFrom(ctx, session, minutos);
  } finally {
    up.stop();
  }
}

async function cmdTreinar(ctx, io) {
  const { target: t } = await ensureAgent(ctx);
  io.print("Treino: o site abre com o agente em modo treino. Converse com ele como um cliente e, em cada resposta,");
  io.print('toque em "Certo" ou "Corrigir". Cada correção vai para a base na hora (a anterior fica em agente-gerador/backup).');
  const up = await upstreamFor(ctx, io);
  const minutos = Number(ctx.flags.minutos) || 30;
  const log = [];
  let backedUp = false;
  const antes = evaluateKnowledge(await readKnowledge(t.dir)).geral;
  const routes = {
    "treino/base": async () => trainingBase(createAgent(await readKnowledge(t.dir)).knowledge),
    // Versão 0.4: frases não entendidas no site, agrupadas, aparecem primeiro no treino.
    "treino/faltas": async () => {
      const { faltas } = await readMissFiles(missFiles(ctx, t));
      return groupMisses(faltas).slice(0, 10);
    },
    "treino/ok": async (body) => {
      log.push({ tipo: "ok", pergunta: String(body.pergunta || "").slice(0, 200), intencao: String(body.intencao || "").slice(0, 60), em: new Date().toISOString() });
      return { ok: true };
    },
    "treino/corrigir": async (body) => {
      const raw = await readKnowledge(t.dir);
      const { knowledge, mudanca } = applyCorrection(raw, body);
      const checked = createAgent(knowledge);
      if (body.tipo === "fluxo" && !checked.knowledge.fluxos.length) throw new Error("A conversa em etapas ficou incompleta.");
      if (!backedUp) {
        await backup(ctx, t.dir);
        backedUp = true;
      }
      await writeKnowledge(t.dir, knowledge, { force: true });
      const geral = evaluateKnowledge(knowledge).geral;
      log.push({ tipo: "correcao", pergunta: String(body.pergunta).slice(0, 200), correcao: body.tipo, mudanca, em: new Date().toISOString() });
      io.print(`     Aprendido: ${mudanca}`);
      return { ok: true, mudanca, geral };
    },
  };
  const pub = t.publicPath || "/agente/";
  try {
    const session = await runSession({
      upstream: up.url,
      port: 4710,
      minutos,
      inject: {
        head: '<script src="/__agente-gerador/treino.js"></script>',
        body: `<link rel="stylesheet" href="${pub}widget.css"><script type="module" src="${pub}widget.js"></script><script src="/__agente-gerador/gravador.js"></script>`,
      },
      routes,
      io,
      listenFree,
      open: ctx.flags["sem-navegador"] ? null : openBrowser,
      waitEnter: io.waitEnter,
    });
    const learned = await learnFrom(ctx, session, minutos);
    const text = `${trainingText(log, { antes, depois: learned.geral })}\n${learned.texto}`;
    await writeFile(join(ctx.work, "TREINO.txt"), text);
    await writeFile(join(ctx.work, "treino-log.json"), `${JSON.stringify(log, null, 2)}\n`);
    return { log, antes, depois: learned.geral, observacao: learned.changes, texto: text };
  } finally {
    up.stop();
  }
}

// Versão 0.4: onde procurar as frases não entendidas.
function missFiles(ctx, t) {
  return [...(ctx.flags.arquivo ? [resolve(ctx.flags.arquivo)] : []), join(t.dir, "faltas.jsonl"), join(ctx.project, "faltas.json"), join(ctx.work, "faltas.json")];
}
async function cmdAprender(ctx, io) {
  const { raw, target: t } = await currentKnowledge(ctx);
  const { faltas, arquivos } = await readMissFiles(missFiles(ctx, t));
  // Versão 0.11: frases que o serviço do agente (Cloudflare) guardou.
  if (ctx.config.servico?.kvId) {
    try {
      const doServico = await missesFor(siteKeyOf(ctx), { servico: ctx.config.servico });
      if (doServico.length) {
        faltas.push(...doServico);
        arquivos.push(`${ctx.config.servico.url} (serviço do agente)`);
      }
    } catch (error) {
      io.print?.(`Não consegui ler as frases do serviço do agente: ${error.message}`);
    }
  }
  const groups = suggestFor(groupMisses(faltas), raw);
  const text = learnText(groups, { arquivos: arquivos.map((f) => relative(ctx.project, f) || f) });
  await mkdir(ctx.work, { recursive: true });
  await writeFile(join(ctx.work, "APRENDER.txt"), `${text}\n`);
  await writeFile(join(ctx.work, "aprender.json"), `${JSON.stringify(groups, null, 2)}\n`);
  if (!ctx.flags.aplicar || !groups.length) return { grupos: groups, arquivos, aplicadas: [], texto: text };
  let knowledge = raw;
  const aplicadas = [];
  const antes = evaluateKnowledge(raw).geral;
  for (const g of groups) {
    let body = null;
    if (io.question) {
      io.print(`\n“${g.frase}” (${g.vezes}x). Sugestão: ${g.sugestao.tipo === "nova" ? "criar pergunta nova" : `${g.sugestao.tipo} “${g.sugestao.titulo}”`}`);
      const choice = (await io.question("  1) aceitar a sugestão  2) pergunta nova com resposta minha  3) pular  [3]: ")).trim();
      if (choice === "1" && g.sugestao.tipo !== "nova") body = correctionFor(g, "sugestao");
      else if (choice === "1" || choice === "2") {
        const resposta = (await io.question("  Resposta certa: ")).trim();
        if (resposta.length >= 2) body = correctionFor(g, "nova", resposta);
      }
    } else if (["intencao", "faq"].includes(g.sugestao.tipo) && g.sugestao.confianca >= 0.8) body = correctionFor(g, "sugestao");
    if (!body) continue;
    try {
      const r = applyCorrection(knowledge, body);
      knowledge = r.knowledge;
      aplicadas.push(r.mudanca);
      io.print(`     Aprendido: ${r.mudanca}`);
    } catch (e) {
      io.print(`     Não aplicado: ${e.message}`);
    }
  }
  if (aplicadas.length) {
    const bkp = await backup(ctx, t.dir);
    await writeKnowledge(t.dir, knowledge, { force: true });
    return { grupos: groups, arquivos, aplicadas, backup: bkp, antes, depois: evaluateKnowledge(knowledge).geral, texto: text };
  }
  return { grupos: groups, arquivos, aplicadas, texto: text };
}

// Versão 0.4: editor visual. Salva com backup (um por sessão) e mostra o acerto.
async function cmdEditar(ctx, io) {
  const { target: t } = await ensureAgent(ctx);
  let backedUp = null;
  const editor = await startEditor({
    load: () => readKnowledge(t.dir),
    save: async (knowledge) => {
      if (!backedUp) backedUp = await backup(ctx, t.dir);
      await writeKnowledge(t.dir, knowledge, { force: true });
      io.print(`     Base salva (${new Date().toLocaleTimeString("pt-BR")}).`);
      return { backup: backedUp };
    },
    port: Number(ctx.flags.porta) || 4720,
    listen: listenFree,
  });
  io.print(`Editor da base: ${editor.url}\n(abra este endereço; ele tem o código desta sessão). Ctrl+C ou Enter para encerrar.`);
  if (!ctx.flags["sem-navegador"]) openBrowser(editor.url);
  return editor;
}

// Versão 0.9: desinstalar. Mostra o que vai sair e pede confirmação (ou --sim).
function uninstallPlanText(plan) {
  if (!plan.instalado) return "Não encontrei um agente criado pelo agent-generator neste projeto.";
  return [
    "Agente encontrado neste projeto. A desinstalação vai:",
    ...(plan.pasta ? [`  - apagar a pasta ${plan.pasta.rel}/ (${plan.pasta.arquivos} arquivos; a base de conhecimento é guardada antes)`] : []),
    ...(plan.paginas.length ? [`  - tirar a linha do widget de: ${plan.paginas.join(", ")}`] : []),
    `  - ${plan.trabalho.existe ? `${plan.trabalho.rel}/ ${"fica (relatórios e backups)"}; com --tudo, é apagada também` : "sem pasta de trabalho"}`,
    ...(plan.referencias.length ? [`  ! Linha colada à mão (remova você): ${plan.referencias.join(", ")}`] : []),
  ].join("\n");
}
async function cmdDesinstalar(ctx, io) {
  const plan = await planUninstall(ctx.project, { config: ctx.config, work: ctx.work });
  if (!ctx.flags.json) io.print(uninstallPlanText(plan));
  if (!plan.instalado) return { plan, feito: false };
  const ok = ctx.flags.sim || (io.question && (await io.ask("\nDesinstalar o agente deste projeto?", false)));
  if (!ok) {
    if (!ctx.flags.json) io.print(io.question ? "Nada foi alterado." : "Nada foi alterado. Para confirmar sem perguntas, use --sim.");
    return { plan, feito: false };
  }
  const r = await runUninstall(ctx.project, plan, { apagarTrabalho: Boolean(ctx.flags.tudo) });
  return { plan, feito: true, ...r };
}

async function cmdAssistente(ctx) {
  const interactive = Boolean(process.stdin.isTTY) && !ctx.flags.sim;
  const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  const io = makeIo(ctx, rl);
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
    observar: () => cmdObservar(ctx, io),
    planoDesinstalar: () => planUninstall(ctx.project, { config: ctx.config, work: ctx.work }),
    desinstalar: (plan) => runUninstall(ctx.project, plan),
    async servir(root) {
      const port = await listenFree(staticServer(root), Number(ctx.flags.porta) || 5173);
      return `http://localhost:${port}/`;
    },
  };
  const result = await runAssistant({ project: ctx.project, work: ctx.work, io, steps, hasGemini: Boolean(process.env.GEMINI_API_KEY) });
  if (result.status === "servindo") rl?.close();
  return result;
}

// ---------- Versão 0.11/0.12: chave de IA, serviço do agente e site já publicado ----------
const isLocalUrl = (u) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(String(u || ""));
// O que identifica o serviço no cofre: a origem do site (site publicado) ou a pasta do projeto.
const siteKeyOf = (ctx) => (ctx.config.modo === "servico" ? ctx.config.site || ctx.project : ctx.project);
const pkgVersion = async () => JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version;
const comEsquema = (u) => {
  const v = String(u || "").trim();
  if (!v) return "";
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).origin;
  } catch {
    throw new Error(`Endereço do site inválido: ${v}. Ex.: https://minhaloja.com.br`);
  }
};

// Endereço público do site, quando o projeto diz (CNAME, homepage, canonical/og:url, sitemap).
async function siteUrlGuess(ctx) {
  if (ctx.config.siteUrl) return ctx.config.siteUrl;
  const read = (f) => readFile(join(ctx.project, f), "utf8").catch(() => "");
  const ok = (u) => (u && !isLocalUrl(u) ? new URL(u).origin : "");
  try {
    const cname = ((await read("CNAME")) || (await read("public/CNAME"))).trim().split(/\s+/)[0];
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(cname || "")) return `https://${cname.toLowerCase()}`;
    const pkg = JSON.parse((await read("package.json")) || "{}");
    if (/^https?:\/\//i.test(pkg.homepage || "") && ok(pkg.homepage)) return ok(pkg.homepage);
    for (const f of ["index.html", "public/index.html"]) {
      const h = await read(f);
      const m = h.match(/<link[^>]+rel=["']canonical["'][^>]*href=["'](https?:\/\/[^"']+)/i) || h.match(/<meta[^>]+property=["']og:url["'][^>]*content=["'](https?:\/\/[^"']+)/i);
      if (m && ok(m[1])) return ok(m[1]);
    }
    for (const f of ["sitemap.xml", "public/sitemap.xml"]) {
      const m = (await read(f)).match(/<loc>\s*(https?:\/\/[^<\s]+)/i);
      if (m && ok(m[1])) return ok(m[1]);
    }
  } catch {
    /* sem endereço conhecido */
  }
  return "";
}

// Pasta de projeto: a chave da IA vai como segredo para o serviço do agente e o widget passa a
// chamar o serviço só quando não entende (agente.ia.endpoint). Sem variável no Render ou Action.
async function publicarIa(ctx, log = () => {}, { site } = {}) {
  const { raw, target: t } = await currentKnowledge(ctx);
  const endereco = site !== undefined ? comEsquema(site) : ctx.config.siteUrl || (await siteUrlGuess(ctx));
  const nome = ctx.config.servico?.nome || serviceName(endereco || basename(ctx.project));
  const r = await publishFor({ siteKey: ctx.project, site: endereco, origens: endereco ? [endereco] : [], locais: true, knowledge: raw, modo: "ia", versao: await pkgVersion(), log, nome });
  await writeKnowledge(t.dir, { agente: { ...raw.agente, ia: { endpoint: `${r.url}/api/ia` } } }, { force: true });
  await saveConfig(ctx, { ...(endereco ? { siteUrl: endereco } : {}), servico: { url: r.url, nome: r.nome, contaId: r.contaId, kvId: r.kvId, modo: r.modo } });
  return { ...r, site: endereco };
}

// Site já publicado (pasta do "site <url>" ou do instalador): o agente inteiro vai para o serviço.
async function publicarCompleto(ctx, log = () => {}, { semIa = false } = {}) {
  const { raw, target: t } = await currentKnowledge(ctx);
  const site = ctx.config.site;
  if (!site) throw new Error("Esta pasta não veio de um site publicado (comando site <url> ou o instalador, opção Meu site já está no ar).");
  // O widget roda no navegador da visita; só o que ele não entender vai ao serviço (../api/ia).
  if (raw.agente?.endpoint || raw.agente?.ia?.endpoint !== "../api/ia") await writeKnowledge(t.dir, { agente: { ...raw.agente, endpoint: "", ia: { endpoint: "../api/ia" } } }, { force: true });
  const knowledge = await readKnowledge(t.dir);
  const r = await publishFor({ siteKey: site, site, origens: [site], semIa, knowledge, agentDir: t.dir, modo: "completo", versao: await pkgVersion(), log, nome: ctx.config.servico?.nome });
  await saveConfig(ctx, { servico: { url: r.url, nome: r.nome, contaId: r.contaId, kvId: r.kvId, modo: r.modo } });
  const kit = await placementKit({ serviceUrl: r.url, site, nome: knowledge.agente?.nome || "", work: ctx.work, homeHtml: await readHome(ctx.project) });
  return { ...r, kit };
}

async function cmdIa(flags) {
  if (flags.esquecer) {
    const qual = ["ia", "cloudflare", "tudo"].includes(flags.esquecer) ? flags.esquecer : "ia";
    await forgetVault(qual);
    console.log(qual === "tudo" ? "Cofre apagado (chave da IA e da Cloudflare)." : `Apagado do cofre: ${qual}.`);
    return 0;
  }
  const provedor = typeof flags.provedor === "string" ? flags.provedor.toLowerCase() : "";
  if (!provedor) {
    const v = await vaultState();
    if (flags.json) {
      console.log(JSON.stringify(v, null, 2));
      return 0;
    }
    console.log(v.ia ? `IA conectada: ${PROVEDORES[v.ia.provedor]?.nome || v.ia.provedor} · modelo ${v.ia.modelo || "-"} · chave ${v.ia.chave}` : "Nenhuma IA conectada. Ex.: agent-generator ia --provedor openrouter");
    console.log(v.cloudflare ? `Cloudflare: conta ${v.cloudflare.conta}${v.cloudflare.subdominio ? ` (${v.cloudflare.subdominio}.workers.dev)` : ""} · token ${v.cloudflare.token}` : "Cloudflare: não conectada (agent-generator publicar <pasta> --token <token>).");
    for (const [k, sv] of Object.entries(v.servicos)) console.log(`Serviço: ${sv.url} (${k}) · IA: ${sv.ia}`);
    return 0;
  }
  if (!PROVEDORES[provedor]) throw new Error(`Provedor desconhecido: ${provedor}. Use gemini, openrouter ou openai.`);
  const VAR = { gemini: "GEMINI_API_KEY", openrouter: "OPENROUTER_API_KEY", openai: "OPENAI_API_KEY" };
  let chave = typeof flags.chave === "string" ? flags.chave : process.env[VAR[provedor]] || "";
  if (provedor === "openrouter" && !chave) {
    const sessao = await startOpenRouter({ abrir: flags["sem-navegador"] ? () => {} : openBrowser });
    console.log(`Abrindo o OpenRouter no navegador: entre e clique em Authorize.\nSe não abriu, copie o endereço: ${sessao.url}\n(esperando até 5 minutos...)`);
    const r = await sessao.pronto;
    console.log(`${r.mensagem}\nGuardada no cofre do seu usuário (fora do projeto). Chave: ${r.cofre.ia.chave}`);
    return 0;
  }
  if (!chave && provedor === "gemini" && process.stdin.isTTY) {
    console.log(`Copie a sua chave do Google AI Studio: ${LINKS.gemini}`);
    if (!flags["sem-navegador"]) openBrowser(LINKS.gemini);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    chave = (await rl.question("Cole a chave e tecle Enter: ")).trim();
    rl.close();
  }
  if (!chave && provedor !== "openai") throw new Error(`Informe a chave: --chave <chave> ou a variável ${VAR[provedor]}.${provedor === "gemini" ? ` Crie ou copie em ${LINKS.gemini}` : ""}`);
  const r = await saveIaKey({ provedor, chave, baseUrl: flags.api, modelo: flags.modelo });
  console.log(`${r.mensagem}\nGuardada no cofre do seu usuário (fora do projeto). Chave: ${r.cofre.ia.chave}`);
  return 0;
}

async function cmdPublicar(ctx) {
  const f = ctx.flags;
  const out = (l) => !f.json && console.log(l);
  if (typeof f.token === "string") {
    const c = await saveCloudflare(f.token);
    out(`Cloudflare conectada: conta ${c.conta}${c.subdominio ? ` (${c.subdominio}.workers.dev)` : ""}. Token guardado no cofre.`);
  }
  if (f.remover) {
    const ok = await removeFor(siteKeyOf(ctx), { servico: ctx.config.servico });
    if (ctx.config.modo !== "servico" && ctx.config.destino) {
      const { raw, target: t } = await currentKnowledge(ctx);
      if (raw.agente?.ia) await writeKnowledge(t.dir, { agente: { ...raw.agente, ia: null } }, { force: true });
    }
    await saveConfig(ctx, { servico: null });
    print(ctx, { removido: ok }, ok ? "Serviço do agente apagado da Cloudflare. Se colou a linha do agente no site, apague-a também (ou desative o plugin)." : "Nenhum serviço publicado para esta pasta.");
    return { removido: ok };
  }
  if (ctx.config.modo === "servico") {
    const r = await publicarCompleto(ctx, out);
    print(ctx, { url: r.url, saude: r.saude, tags: r.kit.tags, carregador: r.kit.loader, plataforma: r.kit.plataforma, wordpress: r.kit.wordpressZip }, [
      "",
      `Agente publicado em ${r.url}${r.saude ? "" : " (o endereço pode levar alguns minutos para responder)"}.`,
      "Cole no site, antes de </body> (ou no campo de código do rodapé da plataforma):",
      r.kit.tags,
      "",
      `Plataforma detectada: ${r.kit.plataforma}. Passo a passo e versão para Google Tag Manager: ${relative(ctx.project, join(ctx.work, "COMO-COLOCAR-NO-SITE.txt"))}`,
      `WordPress: plugin pronto em ${relative(ctx.project, r.kit.wordpressZip)} (Plugins > Adicionar novo > Enviar plugin).`,
    ].join("\n"));
    return r;
  }
  const r = await publicarIa(ctx, out, { site: typeof f.site === "string" ? f.site : undefined });
  print(ctx, { url: r.url, site: r.site, saude: r.saude }, [
    "",
    `Serviço da IA publicado em ${r.url}. A chave ficou como segredo na Cloudflare (nada de variável no Render ou Action no GitHub).`,
    `O agente do site chama ${r.url}/api/ia só quando não entende uma frase.`,
    r.site ? `Domínio liberado: ${r.site} (e localhost para testes).` : "Sem o endereço do site, só os testes no computador (localhost) usam a IA. Rode de novo com --site https://seusite.com.br.",
    "Publique o site de novo uma vez (o agente.json ganhou o endereço do serviço). Depois, trocar a chave é só rodar este comando de novo.",
  ].join("\n"));
  return r;
}

// Versão 0.9: instalador visual (janela com etapas e checkboxes) no lugar das perguntas no
// terminal. Usa os mesmos passos do assistente; depois de instalar, continua aberto para a etapa 2.
const RECURSO_INFO = {
  catalogo: ["Produtos, serviços e preços", "Responde sobre o catálogo (nome, preço, categoria) e compara itens.", false],
  busca: ["Usar a busca do site", "Quando a pessoa procura algo, monta o link da busca do próprio site.", false],
  conta: ["Consultar dados da conta", "Pedidos, agendamentos ou reservas de quem está logado, lidos da API do site com a sessão da pessoa. Nada fica salvo.", true],
  perfil: ["Respostas com os dados de quem está logado", "Ex.: \"como está a obra do meu apartamento?\". Os dados ficam só na aba do navegador.", true],
  formularios: ["Explicar formulários e levar até eles", "Agendar, contato, cadastro, orçamento: diz o que preencher e abre a página certa. Nunca envia nada.", false],
  preencher: ["Preencher formulários com a pessoa", "Pergunta nome e e-mail/telefone na conversa e deixa o formulário do site preenchido; a pessoa confere e envia. Os dados ficam só na aba do navegador.", true],
  fotos: ["Mostrar fotos, vídeos e PDFs no chat", "Galerias por etapa ou categoria, vídeos (YouTube/Vimeo) e PDFs encontrados nas páginas.", false],
  fluxos: ["Conversas em etapas", "Perguntas com opções (ex.: escolher tamanho, depois entrega). Você cria no treino da etapa 2.", false],
};
const CATEGORIA_TEXTO = { pagamento: "pagamento", alteracao: "cancelar/excluir", autenticacao: "login/senha", dados_da_conta: "dados da conta", dados_pessoais: "dados pessoais", escrita: "envio de dados", consulta: "consulta" };

function recursosDe(knowledge, perfilAtual) {
  const k = knowledge;
  const disp = {
    catalogo: [k.catalogo.itens.length > 0 || Boolean(k.catalogo.url), k.catalogo.url ? `catálogo vivo pela API ${k.catalogo.url}` : `${k.catalogo.itens.length} ${k.catalogo.rotulo || "itens"}`],
    busca: [k.consultas.buscas.length > 0, k.consultas.buscas.map((b) => b.rotulo).join(", ")],
    conta: [k.consultas.dados.length > 0, k.consultas.dados.map((d) => d.rotulo).join(", ")],
    perfil: [k.perfil.perguntas.length > 0, `${k.perfil.perguntas.length} modelo(s) de pergunta do setor`],
    formularios: [k.interacoes.length > 0, k.interacoes.map((x) => x.titulo).slice(0, 4).join(", ")],
    preencher: (() => {
      const f = k.interacoes.filter((x) => !x.requerLogin && x.campos.some((c) => /e-?mail|telefone|celular|whats|fone|phone/i.test(c)));
      return [f.length > 0, f.map((x) => x.titulo).slice(0, 3).join(", ")];
    })(),
    fotos: [k.midias.galerias.length + k.midias.videos.length + k.midias.arquivos.length > 0, [`${k.midias.galerias.length} galeria(s)`, k.midias.videos.length ? `${k.midias.videos.length} vídeo(s)` : "", k.midias.arquivos.length ? `${k.midias.arquivos.length} PDF(s)` : ""].filter(Boolean).join(", ")],
    fluxos: [true, k.fluxos.length ? `${k.fluxos.length} conversa(s) criada(s)` : "criadas no treino (etapa 2)"],
  };
  return RECURSOS.map((id) => {
    const [titulo, descricao, sensivel] = RECURSO_INFO[id];
    const [disponivel, detalhe] = disp[id];
    const ligado = k.agente.recursos[id] !== false;
    // Sensíveis começam como estão hoje na base; perfil só vem marcado se já estava ligado.
    const padrao = disponivel && (id === "perfil" ? Boolean(perfilAtual?.ativo) && ligado : ligado);
    return { id, titulo, descricao, sensivel, disponivel, detalhe: disponivel ? detalhe || "" : "não encontrado neste projeto", padrao };
  });
}

async function cmdInstalador(flags, pasta) {
  const { startInstaller } = await import("../src/gui/server.js");
  const { openWindow } = await import("../src/gui/janela.js");
  const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const rel = (ctx, f) => relative(ctx.project, f).split(sep).join("/") || ".";
  const FRAMEWORKS = ["Next.js", "Nuxt", "SvelteKit", "Astro", "Angular"];
  const semNavegador = Boolean(flags["sem-navegador"]);
  const porCategoriaDe = (criticas) => {
    const out = {};
    for (const c of criticas) out[CATEGORIA_TEXTO[c.categoria] || c.categoria] = (out[CATEGORIA_TEXTO[c.categoria] || c.categoria] || 0) + 1;
    return out;
  };
  // Funcionalidades e aparência escolhidas na janela -> mudanças em agente.json (e perfil.json).
  function escolhasNaBase(raw, knowledge, escolhas) {
    const recursos = { ...knowledge.agente.recursos };
    for (const id of RECURSOS) if (typeof escolhas.recursos?.[id] === "boolean") recursos[id] = escolhas.recursos[id];
    const p = escolhas.agente || {};
    const agente = { ...raw.agente, recursos };
    if (typeof p.nome === "string" && p.nome.trim()) agente.nome = p.nome.trim().slice(0, 80);
    if (/^#[0-9a-f]{6}$/i.test(p.cor || "")) agente.cor = p.cor;
    if (["amigavel", "formal", "neutro"].includes(p.tom)) agente.tom = p.tom;
    if (["direita", "esquerda"].includes(p.posicao)) agente.posicao = p.posicao;
    if (typeof p.saudacao === "string" && p.saudacao.trim()) agente.saudacao = p.saudacao.trim().slice(0, 600);
    const mudancas = { agente };
    if (typeof escolhas.recursos?.perfil === "boolean") {
      const perfil = { ...knowledge.perfil, ativo: escolhas.recursos.perfil };
      const fonte = typeof escolhas.perfilFonte === "string" ? escolhas.perfilFonte.trim() : "";
      if (fonte) {
        if (!/^\/(?!\/)/.test(fonte)) throw new Error("O endereço dos dados do usuário precisa ser um caminho do próprio site, ex.: /api/minha-conta");
        perfil.fonte = fonte;
      }
      mudancas.perfil = perfil;
    }
    return { mudancas, recursos };
  }
  const ligadasDe = (recursos) => RECURSOS.filter((id) => recursos[id]).map((id) => RECURSO_INFO[id][0]);

  // Versão 0.12: site já publicado. Lê o site pela URL (crawler da 0.6) e monta a análise no mesmo
  // formato do raio X da pasta, para a janela mostrar as mesmas telas.
  async function analisarUrl(ctx, log, { setor } = {}) {
    if (setor !== undefined) {
      if (setor && !SECTOR_IDS.includes(setor)) throw new Error(`Setor desconhecido: ${setor}`);
      ctx.flags.setor = setor || undefined;
    }
    const jaTinha = Boolean(ctx.config.destino);
    log(`Lendo ${ctx.site} (só páginas públicas, respeitando o robots.txt)...`, 5);
    let lidas = 0;
    const r = await buildFromSite(ctx.site, ctx.project, {
      setor: chosenSector(ctx),
      maxPages: Number(flags["max-paginas"]) || 60,
      delayMs: flags.pausa != null ? Math.max(0, Number(flags.pausa) || 0) : 400,
      soConteudo: jaTinha,
      log: (l) => {
        const t = String(l).trim();
        if (t.startsWith("/")) lidas++;
        log(t.startsWith("/") ? `Página lida: ${t}` : t, Math.min(70, 5 + lidas));
      },
    });
    ctx.config = await readJson(join(ctx.work, "config.json")).catch(() => ctx.config);
    const { report, target: t } = await currentKnowledge(ctx);
    if (jaTinha && ctx.flags.setor) await writeKnowledge(t.dir, { setor: sectorKnowledge(detectSector(textsFromReport(report), { forcar: ctx.flags.setor }), { siteText: siteTextOf(report) }) }, { force: true });
    const base = checkKnowledge(await readKnowledge(t.dir)).knowledge;
    const deteccao = detectSector(textsFromReport(report));
    const criticas = base.acoes.candidatas.filter((c) => c.risco !== "medio");
    log(`${r.paginas} páginas e ${r.produtos} produtos lidos. Pronto.`, 100);
    return {
      modo: "url",
      origem: r.origem,
      site: base.agente.site,
      stack: ["Site publicado"],
      resumo: { ...report.resumo, paginas: r.paginas, itensCatalogo: base.catalogo.itens.length || r.produtos },
      avisos: r.avisos || [],
      setor: { detectado: deteccao.setor, escolhido: chosenSector(ctx) || "", atual: base.setor.id, nome: base.setor.nome, ranking: deteccao.ranking.slice(0, 4).map(({ id, nome, pontos, evidencias }) => ({ id, nome, pontos, evidencias: evidencias.slice(0, 3) })) },
      setores: SECTOR_IDS,
      destino: { dir: rel(ctx, t.dir), publicPath: "", motivo: "site já publicado: o agente fica num serviço seu na Cloudflare" },
      temBase: jaTinha,
      paginasEntrada: [],
      framework: "",
      manual: true,
      recursos: recursosDe(base, base.perfil),
      perfilFonte: base.perfil.fonte || "",
      criticas: { total: criticas.length, porCategoria: porCategoriaDe(criticas), exemplos: criticas.slice(0, 6).map((c) => ({ metodo: c.metodo, caminho: c.caminho, categoria: CATEGORIA_TEXTO[c.categoria] || c.categoria, risco: c.risco })) },
      agente: { nome: base.agente.nome, cor: base.agente.cor, tom: base.agente.tom, posicao: base.agente.posicao, saudacao: base.agente.saudacao },
      gemini: false,
    };
  }

  // Versão 0.12: aplica as escolhas, melhora com a IA (se pedido) e publica o agente inteiro no
  // serviço da Cloudflare. O site não muda até a pessoa colar a linha (próxima etapa).
  async function instalarUrl(ctx, escolhas, log) {
    log("Preparando...", 5);
    const { raw, target: t } = await currentKnowledge(ctx);
    const { knowledge } = checkKnowledge(raw);
    const { mudancas, recursos } = escolhasNaBase(raw, knowledge, escolhas);
    mudancas.agente = { ...mudancas.agente, endpoint: "", ia: { endpoint: "../api/ia" } };
    if (ctx.flags.setor) await saveConfig(ctx, { setor: ctx.flags.setor });
    await writeKnowledge(t.dir, mudancas, { force: true });
    const ligadas = ligadasDe(recursos);
    log(`Funcionalidades ligadas: ${ligadas.join(", ") || "só as respostas básicas"}.`, 15);
    let ev = await cmdAvaliar(ctx);
    const iaEsc = escolhas.ia || {};
    const { ia } = await localIa();
    if (iaEsc.usar && ia && iaEsc.melhorar) {
      try {
        log(`Melhorando a base com ${PROVEDORES[ia.provedor]?.nome || ia.provedor}...`, 25);
        await cmdMelhorarIa(ctx, ia);
        ev = await cmdAvaliar(ctx);
      } catch (error) {
        log(`A IA não respondeu (${error.message}). A base sem IA continua valendo.`);
      }
    }
    log("Publicando o agente na sua conta da Cloudflare...", 40);
    const r = await publicarCompleto(ctx, (l) => log(l, 80), { semIa: !(iaEsc.usar && ia) });
    const resumo = [
      `Agente publicado em ${r.url}${r.saude ? "" : " (o endereço novo pode levar alguns minutos para responder)"}.`,
      `Funcionalidades: ${ligadas.join(", ") || "respostas básicas"}.`,
      iaEsc.usar && ia ? `IA: ${PROVEDORES[ia.provedor]?.nome || ia.provedor} (${ia.modelo}); a chave ficou como segredo no serviço.` : "IA: desligada (o agente responde só com a base).",
      `Acerto da base: ${ev.geral ?? "-"}%.`,
      "Falta colar a linha no site: próxima etapa.",
    ];
    await writeFile(join(ctx.work, "RESUMO.txt"), `Agent Generator ${version} (instalador, site publicado) - ${new Date().toLocaleString("pt-BR")}\nSite: ${ctx.config.site}\nPasta: ${ctx.project}\n\nFeito:\n${resumo.map((x) => `- ${x}`).join("\n")}\n`);
    log(`Pronto! Acerto da base: ${ev.geral ?? "-"}%.`, 100);
    return { modo: "url", dir: rel(ctx, t.dir), servico: r.url, saude: Boolean(r.saude), kit: { tags: r.kit.tags, loader: r.kit.loader, guias: r.kit.guias, plataforma: r.kit.plataforma, temGtm: r.kit.temGtm }, geral: ev.geral, porcentagens: ev.porcentagens, resumo, inseridas: [], snippet: "", podeAbrirSite: false };
  }

  const ops = {
    async abrir(p) {
      if (!p) throw new Error("Informe a pasta do projeto.");
      // A porta e o --janela são do instalador; o resto (site, editor, treino) usa as portas padrão.
      const { porta, janela, ...resto } = flags;
      const ctx = await context(p, resto);
      const has = async (f) => Boolean(await stat(join(ctx.project, f)).catch(() => null));
      const info = { pasta: ctx.project, temIndex: await has("index.html"), temPackage: await has("package.json"), temBase: false, jaInstalado: Boolean(ctx.config.destino) };
      if (ctx.config.destino) info.temBase = Boolean(await stat(join(resolve(ctx.project, ctx.config.destino), "conhecimento", "agente.json")).catch(() => null));
      // Versão 0.9: agente criado por nós já instalado aqui? Então a janela oferece desinstalar.
      const plan = await planUninstall(ctx.project, { config: ctx.config, work: ctx.work });
      Object.assign(info, { instalado: plan.instalado, pastaAgente: plan.pasta?.rel || "" });
      if (plan.pasta) info.temBase = true;
      return { ctx, info };
    },
    async planoDesinstalar(ctx) {
      const p = await planUninstall(ctx.project, { config: ctx.config, work: ctx.work });
      return { instalado: p.instalado, pasta: p.pasta && { rel: p.pasta.rel, arquivos: p.pasta.arquivos }, paginas: p.paginas, referencias: p.referencias, trabalho: { rel: p.trabalho.rel, existe: p.trabalho.existe }, servico: ctx.config.servico?.url ? { url: ctx.config.servico.url } : null };
    },
    async desinstalar(ctx, escolhas, log) {
      log("Conferindo o que existe do agente...", 5);
      const plan = await planUninstall(ctx.project, { config: ctx.config, work: ctx.work });
      if (!plan.instalado) throw new Error("Não há agente instalado nesta pasta.");
      const servico = ctx.config.servico;
      const r = await runUninstall(ctx.project, plan, { apagarTrabalho: escolhas.apagarTrabalho === true, log });
      // Versão 0.11: o serviço do agente na Cloudflare (IA) sai junto, se a pessoa marcou.
      if (escolhas.apagarServico === true && servico?.nome) {
        try {
          log("Apagando o serviço do agente na Cloudflare...", 95);
          await removeFor(ctx.project, { servico });
          r.resumo = [...(r.resumo || []), "Serviço do agente apagado da Cloudflare."];
        } catch (error) {
          r.resumo = [...(r.resumo || []), `O serviço na Cloudflare não foi apagado (${error.message}). Apague em Workers & Pages no painel da Cloudflare.`];
        }
      }
      return r;
    },
    async analisar(ctx, log, { setor } = {}) {
      if (ctx.modo === "url") return analisarUrl(ctx, log, { setor });
      log("Lendo os arquivos do projeto (só leitura)...", 10);
      if (setor !== undefined) {
        if (setor && !SECTOR_IDS.includes(setor)) throw new Error(`Setor desconhecido: ${setor}`);
        ctx.flags.setor = setor || undefined;
      }
      const { report } = await cmdAnalisar(ctx);
      log(`${report.resumo.paginas} páginas, ${report.resumo.formularios} formulários e ${report.resumo.itensCatalogo} itens de catálogo encontrados.`, 55);
      const t = await target(ctx, report.projeto.stack);
      const atual = await readKnowledge(t.dir);
      const temBase = Boolean(atual.faq || atual.agente);
      log("Montando a prévia da base de conhecimento...", 75);
      const preview = generateKnowledge(report, { setor: chosenSector(ctx) }).knowledge;
      const base = temBase ? checkKnowledge(atual).knowledge : preview;
      const deteccao = detectSector(textsFromReport(report));
      const entries = await entryPages(ctx.project);
      const framework = report.projeto.stack.find((s) => FRAMEWORKS.includes(s)) || "";
      const criticas = preview.acoes.candidatas.filter((c) => c.risco !== "medio");
      const porCategoria = {};
      for (const c of criticas) porCategoria[CATEGORIA_TEXTO[c.categoria] || c.categoria] = (porCategoria[CATEGORIA_TEXTO[c.categoria] || c.categoria] || 0) + 1;
      log("Pronto.", 100);
      return {
        site: report.projeto.site,
        stack: report.projeto.stack,
        resumo: report.resumo,
        avisos: report.avisos || [],
        setor: { detectado: deteccao.setor, escolhido: chosenSector(ctx) || "", atual: base.setor.id, nome: base.setor.nome, ranking: deteccao.ranking.slice(0, 4).map(({ id, nome, pontos, evidencias }) => ({ id, nome, pontos, evidencias: evidencias.slice(0, 3) })) },
        setores: SECTOR_IDS,
        destino: { dir: rel(ctx, t.dir), publicPath: t.publicPath, motivo: t.why },
        temBase,
        paginasEntrada: entries.map((f) => rel(ctx, f)),
        framework,
        manual: !entries.length || Boolean(framework),
        recursos: recursosDe(base, base.perfil),
        perfilFonte: base.perfil.fonte || "",
        criticas: { total: criticas.length, porCategoria, exemplos: criticas.slice(0, 6).map((c) => ({ metodo: c.metodo, caminho: c.caminho, categoria: CATEGORIA_TEXTO[c.categoria] || c.categoria, risco: c.risco })) },
        agente: { nome: base.agente.nome, cor: base.agente.cor, tom: base.agente.tom, posicao: base.agente.posicao, saudacao: base.agente.saudacao },
        gemini: Boolean(process.env.GEMINI_API_KEY),
      };
    },
    async instalar(ctx, escolhas, log) {
      if (ctx.modo === "url") return instalarUrl(ctx, escolhas, log);
      log("Preparando...", 5);
      const report = await loadReport(ctx);
      const g = await cmdGerar(Object.assign(ctx, { flags: { ...ctx.flags, forcar: Boolean(escolhas.regerar) } }));
      log(g.backup ? `Base anterior guardada em ${rel(ctx, g.backup)}.` : g.kept.length ? "Base existente mantida (nada do que você editou foi apagado)." : "Base de conhecimento criada a partir do raio X.", 30);
      // Funcionalidades marcadas e personalização vão para agente.json (e perfil.json).
      const raw = await readKnowledge(g.target.dir);
      const { knowledge } = checkKnowledge(raw);
      const { mudancas, recursos } = escolhasNaBase(raw, knowledge, escolhas);
      // Setor trocado na janela com a base mantida: só o setor.json muda (como no comando setor).
      if (ctx.flags.setor) {
        if (g.kept.length && !escolhas.regerar) mudancas.setor = sectorKnowledge(detectSector(textsFromReport(report), { forcar: ctx.flags.setor }), { siteText: siteTextOf(report) });
        await saveConfig(ctx, { setor: ctx.flags.setor });
      }
      await writeKnowledge(g.target.dir, mudancas, { force: true });
      const ligadas = ligadasDe(recursos);
      log(`Funcionalidades ligadas: ${ligadas.join(", ") || "só as respostas básicas"}.`, 45);
      const inst = await cmdInstalar(Object.assign(ctx, { flags: { ...ctx.flags, inserir: false } }), { report });
      log(`Núcleo, widget e base copiados para ${rel(ctx, inst.dir)}/.`, 60);
      let inseridas = [];
      let snippet = "";
      const entries = await entryPages(ctx.project);
      const framework = report.projeto.stack.find((s) => FRAMEWORKS.includes(s));
      if (escolhas.inserir !== false && entries.length && !framework) {
        const res = await injectTags(ctx.project, inst.publicPath, { backupDir: join(ctx.work, "backup", "html") });
        inseridas = res.changed.map((f) => rel(ctx, f));
        log(inseridas.length ? `Linha do widget inserida em ${inseridas.length} página(s) (cópia em agente-gerador/backup/html).` : "As páginas já tinham a linha do widget.", 75);
      } else {
        snippet = inst.snippet;
        await mkdir(ctx.work, { recursive: true });
        await writeFile(join(ctx.work, "COMO-LIGAR.txt"), `${snippet}\n`);
        log("Falta um passo manual: colar a linha do widget (veja agente-gerador/COMO-LIGAR.txt).", 75);
      }
      log("Testando a base com as próprias perguntas...", 85);
      let ev = await cmdAvaliar(ctx);
      if (escolhas.gemini && process.env.GEMINI_API_KEY) {
        try {
          log("Melhorando a base com o Gemini...", 90);
          await cmdGemini(ctx);
          ev = await cmdAvaliar(ctx);
        } catch (error) {
          log(`O Gemini não respondeu (${error.message}). A base sem IA continua valendo.`);
        }
      }
      // Versão 0.11: IA conectada no instalador (cofre): melhora a base e publica o serviço com a
      // chave como segredo. "Sem IA" tira o endereço do serviço do agente.json.
      const iaEsc = escolhas.ia || {};
      let iaInfo = null;
      if (iaEsc.usar) {
        const { ia } = await localIa();
        if (!ia) log("A IA foi escolhida, mas nenhuma chave está conectada: o agente segue sem IA.");
        else {
          if (iaEsc.melhorar) {
            try {
              log(`Melhorando a base com ${PROVEDORES[ia.provedor]?.nome || ia.provedor}...`, 88);
              await cmdMelhorarIa(ctx, ia);
              ev = await cmdAvaliar(ctx);
            } catch (error) {
              log(`A IA não respondeu (${error.message}). A base sem IA continua valendo.`);
            }
          }
          if (iaEsc.publicar !== false) {
            try {
              log("Publicando o serviço da IA na sua conta da Cloudflare...", 92);
              const r = await publicarIa(ctx, (l) => log(l, 95), { site: typeof iaEsc.site === "string" ? iaEsc.site : undefined });
              iaInfo = { url: r.url, site: r.site, saude: Boolean(r.saude), provedor: ia.provedor, modelo: ia.modelo };
            } catch (error) {
              iaInfo = { erro: error.message };
              log(`Não deu para publicar o serviço da IA (${error.message}). O agente funciona sem IA; tente de novo na etapa Inteligência artificial.`);
            }
          }
        }
      } else if (iaEsc.usar === false) {
        const atual = await readKnowledge(inst.dir);
        if (atual.agente?.ia) await writeKnowledge(inst.dir, { agente: { ...atual.agente, ia: null } }, { force: true });
      }
      const resumo = [
        `Agente instalado em ${rel(ctx, inst.dir)}/.`,
        `Funcionalidades: ${ligadas.join(", ") || "respostas básicas"}.`,
        inseridas.length ? `Widget ligado em: ${inseridas.join(", ")}.` : snippet ? "Ligar o widget: veja agente-gerador/COMO-LIGAR.txt." : "As páginas já tinham o widget.",
        `Acerto da base: ${ev.geral ?? "-"}%.`,
        ...(iaInfo?.url ? [`IA: ${PROVEDORES[iaInfo.provedor]?.nome || iaInfo.provedor} pelo serviço ${iaInfo.url} (chave guardada como segredo na Cloudflare)${iaInfo.site ? `; domínio liberado: ${iaInfo.site}` : "; informe o endereço do site para liberar o domínio"}.`] : iaInfo?.erro ? [`IA: serviço não publicado (${iaInfo.erro}).`] : []),
        ...(g.backup ? [`Backup da base anterior: ${rel(ctx, g.backup)}`] : []),
      ];
      await writeFile(
        join(ctx.work, "RESUMO.txt"),
        `Agent Generator ${version} (instalador) - ${new Date().toLocaleString("pt-BR")}\nProjeto: ${ctx.project}\n\nFeito:\n${resumo.map((r) => `- ${r}`).join("\n")}\n\nPróximo passo: etapa 2 (treino assistido) no instalador ou com "agent-generator treinar".\n`,
      );
      log(`Pronto! Acerto da base: ${ev.geral ?? "-"}%.`, 100);
      const root = await staticRoot(ctx.project, entries);
      return { dir: rel(ctx, inst.dir), publicPath: inst.publicPath, inseridas, snippet, geral: ev.geral, porcentagens: ev.porcentagens, resumo, podeAbrirSite: Boolean(root && !framework), ia: iaInfo };
    },
    async testar(ctx, mensagem, contexto) {
      const { raw } = await currentKnowledge(ctx);
      const agent = createAgent(raw);
      // Versão 0.11: com a IA ligada para este site, a conversa de teste usa a chave do cofre,
      // do mesmo jeito que o serviço do agente faria.
      const { config } = raw.agente?.ia ? await localIa() : { config: null };
      const r = mensagem ? (config ? await withIa(agent, config).replyAsync(mensagem, contexto) : agent.reply(mensagem, contexto)) : { ...agent.saudacao(), contexto: {} };
      return { texto: r.texto, itens: (r.itens || []).slice(0, 4).map((i) => ({ nome: i.nome, precoTexto: i.precoTexto, link: i.link })), acoes: r.acoes || [], sugestoes: r.sugestoes || [], intencao: r.intencao || "", confianca: r.confianca ?? null, contexto: r.contexto || {}, interpretado: r.interpretado || "", fonte: r.fonte || "" };
    },
    async abrirSite(ctx) {
      const root = await staticRoot(ctx.project, await entryPages(ctx.project));
      if (!root) throw new Error("Este projeto não é um site HTML simples. Rode o site do seu jeito (ex.: npm run dev) e use a etapa 2.");
      const s = await serveStatic(ctx, root);
      openBrowser(s.url);
      return { ...s, origem: rel(ctx, root) };
    },
    async sessao(ctx, modo, opcoes, io) {
      Object.assign(ctx.flags, { url: opcoes.url || undefined, minutos: opcoes.minutos, "sem-navegador": Boolean(flags["sem-navegador"]) });
      const r = modo === "observar" ? await cmdObservar(ctx, io) : await cmdTreinar(ctx, io);
      return modo === "observar"
        ? { texto: r.texto, antes: r.antes, depois: r.geral }
        : { texto: r.texto, antes: r.antes, depois: r.depois, correcoes: r.log.filter((l) => l.tipo === "correcao").length, certas: r.log.filter((l) => l.tipo === "ok").length };
    },
    async editor(ctx) {
      // A janela do instalador abre o editor numa aba nova (sem abrir duas vezes).
      return cmdEditar({ ...ctx, flags: { ...ctx.flags, "sem-navegador": true } }, { print: () => {} });
    },
    async acerto(ctx) {
      const { raw } = await currentKnowledge(ctx);
      return evaluateKnowledge(raw).geral;
    },
    // ---------- Versão 0.11: IA e Cloudflare; 0.12: site já publicado ----------
    async iaEstado(ctx) {
      return {
        cofre: await vaultState(),
        provedores: Object.values(PROVEDORES).map(({ id, nome, como, resumo }) => ({ id, nome, como, resumo })),
        links: LINKS,
        siteUrl: ctx && ctx.modo !== "url" ? await siteUrlGuess(ctx) : ctx?.config?.site || "",
        servico: ctx?.config?.servico?.url || "",
      };
    },
    iaChave: (cfg) => saveIaKey(cfg),
    iaOpenRouter: () => startOpenRouter({ abrir: semNavegador ? () => {} : openBrowser }),
    iaEsquecer: (qual) => forgetVault(qual),
    cloudflare: (token) => saveCloudflare(token),
    abrirLink(qual) {
      const url = LINKS[qual];
      if (!url) throw new Error("Link desconhecido.");
      if (!semNavegador) openBrowser(url);
      return { url };
    },
    async iniciarUrl(url, base) {
      let u;
      try {
        u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
      } catch {
        throw new Error("Endereço inválido. Ex.: https://minhaloja.com.br");
      }
      if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".") && !isLocalUrl(u.href)) throw new Error("Use o endereço completo do site. Ex.: https://minhaloja.com.br");
      // Segue o redirecionamento (ex.: sem www -> com www) para ler o endereço certo.
      let origem = u.origin;
      try {
        const res = await fetch(u.href, { redirect: "follow", headers: { "user-agent": USER_AGENT, accept: "text/html" }, signal: AbortSignal.timeout(15000) });
        if (res.url) origem = new URL(res.url).origin;
        await res.body?.cancel?.().catch?.(() => {});
      } catch {
        throw new Error(`Não consegui abrir ${u.origin}. Confira o endereço e a internet (ou um bloqueio de rede da empresa).`);
      }
      const out = resolve(base || process.cwd(), `agente-${new URL(origem).host.replace(/[^a-z0-9.-]/gi, "-")}`);
      await mkdir(out, { recursive: true });
      const { porta, janela, ...resto } = flags;
      const ctx = await context(out, resto);
      Object.assign(ctx, { modo: "url", site: origem });
      await saveConfig(ctx, { site: origem });
      return { ctx, info: { modo: "url", site: origem, pasta: out, temBase: Boolean(ctx.config.destino), jaPublicado: Boolean(ctx.config.servico?.url), servico: ctx.config.servico?.url || "", instalado: false } };
    },
    publicar: (ctx, log) => (ctx.modo === "url" || ctx.config.modo === "servico" ? publicarCompleto(ctx, log) : publicarIa(ctx, log, {})),
    async colocar(ctx) {
      const sv = ctx.config.servico;
      if (!sv?.url) throw new Error("Publique o agente primeiro (etapa Publicar).");
      const { raw } = await currentKnowledge(ctx);
      const kit = await placementKit({ serviceUrl: sv.url, site: ctx.config.site, nome: raw.agente?.nome || "", work: ctx.work, homeHtml: await readHome(ctx.project) });
      return { servico: sv.url, site: ctx.config.site, tags: kit.tags, loader: kit.loader, guias: kit.guias, plataforma: kit.plataforma, temGtm: kit.temGtm };
    },
    async verificar(ctx) {
      const sv = ctx.config.servico;
      if (!sv?.url) throw new Error("Publique o agente primeiro.");
      return verifyInstall(ctx.config.site, sv.url);
    },
    async previa(ctx) {
      const { raw, target: t } = await currentKnowledge(ctx);
      const { config } = await localIa();
      const p = await startPreview({ siteUrl: ctx.config.site, agentDir: t.dir, ia: raw.agente?.ia ? iaResponder(config, raw) : null });
      if (!semNavegador) openBrowser(p.url);
      return p;
    },
    wordpressZip: (ctx) => readFile(join(ctx.work, "agente-wordpress.zip")),
    async removerServico(ctx) {
      const ok = await removeFor(siteKeyOf(ctx), { servico: ctx.config.servico });
      await saveConfig(ctx, { servico: null });
      return { removido: ok };
    },
  };
  const janela = Boolean(flags.janela);
  let fim;
  const terminou = new Promise((ok) => (fim = ok));
  const inst = await startInstaller({
    ops,
    pasta,
    versao: version,
    port: Number(flags.porta) || 4730,
    listen: listenFree,
    // Sem terminal (executável "instalador"), fecha sozinho 3 min depois que a janela some.
    vivoMs: janela ? 180_000 : 0,
    onFim: (motivo) => fim(motivo),
  });
  console.log(`Instalador aberto em ${inst.url}\n(se a janela não abriu, copie o endereço no navegador). Feche esta janela ou use o botão "Fechar" do instalador para encerrar.`);
  if (!flags["sem-navegador"]) openWindow(inst.url);
  const motivo = await terminou;
  console.log(`Instalador encerrado (${motivo}).`);
  return 0;
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

// Versão 0.6: site publicado -> serviço do agente.
async function cmdSite(url, folder, flags) {
  if (!url) throw new Error("Informe o endereço do site. Ex.: agent-generator site https://minhaloja.com.br");
  let origin;
  try {
    origin = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    throw new Error(`Endereço inválido: ${url}`);
  }
  if (!flags.sim) {
    if (!process.stdin.isTTY) throw new Error("Use --sim para confirmar que o site é seu ou que você tem autorização para lê-lo.");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ok = /^s/i.test(await rl.question(`O site ${origin.host} é seu ou você tem autorização para lê-lo? (s/N) `));
    rl.close();
    if (!ok) throw new Error("Leitura cancelada. Use só em sites seus ou com autorização.");
  }
  const out = resolve(folder || `agente-${origin.host.replace(/[^a-z0-9.-]/gi, "-")}`);
  let browser = null;
  let render;
  if (flags.navegador) {
    try {
      const { chromium } = await import("playwright");
      browser = await chromium.launch();
      const page = await browser.newPage({ userAgent: USER_AGENT });
      render = async (u) => {
        await page.goto(u, { waitUntil: "networkidle", timeout: 20000 });
        return page.content();
      };
    } catch {
      throw new Error("--navegador precisa do Playwright: npm install playwright && npx playwright install chromium");
    }
  }
  if (!flags.json) console.log(`Lendo ${origin.origin} (páginas públicas, respeitando o robots.txt)...`);
  try {
    const r = await buildFromSite(origin.href, out, {
      setor: typeof flags.setor === "string" && SECTOR_IDS.includes(flags.setor) ? flags.setor : undefined,
      maxPages: Number(flags["max-paginas"]) || 60,
      delayMs: flags.pausa != null ? Math.max(0, Number(flags.pausa) || 0) : 400,
      render,
      force: Boolean(flags.forcar),
      soConteudo: Boolean(flags["so-conteudo"]),
      log: flags.json ? () => {} : (l) => console.log(l),
    });
    if (flags.json) console.log(JSON.stringify(r, null, 2));
    else
      console.log(
        [
          "",
          `Lidas ${r.paginas} páginas e ${r.produtos} produtos${r.catalogoApi ? ` (catálogo vivo pela API ${r.catalogoApi})` : ""}; ${r.faq} perguntas frequentes.`,
          `Serviço do agente em ${r.servico}. Acerto da base: ${r.geral}%.`,
          "",
          `Testar: cd "${r.servico}" && node servico.js   (depois abra http://localhost:8787)`,
          "Publicar: veja LEIA-ME.md na pasta do serviço (Render gratuito, Docker ou outro).",
          "No site, antes de </body>, troque SEU-SERVICO pelo endereço publicado:",
          r.snippet,
        ].join("\n") + notesText(r.avisos),
      );
    return 0;
  } finally {
    await browser?.close();
  }
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
  if (command === "site") return cmdSite(_[1], _[2], flags);
  if (command === "ia") return cmdIa(flags);
  if (command === "instalador") return cmdInstalador(flags, _[1] || process.cwd());
  const ctx = await context(["assistente", "observar", "treinar", "aprender", "editar", "desinstalar", "publicar"].includes(command) ? _[1] || process.cwd() : _[1], flags);
  switch (command) {
    case "assistente": {
      const r = await cmdAssistente(ctx);
      if (flags.json) console.log(JSON.stringify(r, null, 2));
      return r.status === "servindo" ? null : 0;
    }
    case "observar":
    case "treinar": {
      const interactive = Boolean(process.stdin.isTTY) && !flags.sim;
      const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;
      const io = makeIo(ctx, rl);
      try {
        const r = command === "observar" ? await cmdObservar(ctx, io) : await cmdTreinar(ctx, io);
        print(ctx, command === "observar" ? { mudancas: r.changes, acertoAntes: r.antes, acerto: r.geral } : { correcoes: r.log, acertoAntes: r.antes, acerto: r.depois, observacao: r.observacao }, `\n${r.texto}\nAcerto da base: ${command === "observar" ? `${r.antes}% → ${r.geral}%` : `${r.antes}% → ${r.depois}%`}. Relatório em ${WORK}/${command === "observar" ? "OBSERVACAO.txt" : "TREINO.txt"}.`);
        await io.pause();
      } finally {
        rl?.close();
      }
      return 0;
    }
    case "aprender": {
      const interactive = Boolean(process.stdin.isTTY) && !flags.sim;
      const rl = interactive && flags.aplicar ? createInterface({ input: process.stdin, output: process.stdout }) : null;
      const io = makeIo(ctx, rl);
      if (flags.json) io.print = () => {};
      try {
        const r = await cmdAprender(ctx, io);
        print(ctx, { grupos: r.grupos, arquivos: r.arquivos, aplicadas: r.aplicadas, acertoAntes: r.antes, acerto: r.depois }, `${r.texto}${r.aplicadas.length ? `\n\nAplicadas: ${r.aplicadas.length}. Acerto da base: ${r.antes}% → ${r.depois}%. Backup: ${r.backup}` : ""}\nRelatório em ${WORK}/APRENDER.txt.`);
      } finally {
        rl?.close();
      }
      return 0;
    }
    case "editar": {
      const rl = process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null;
      const io = makeIo(ctx, rl);
      const editor = await cmdEditar(ctx, io);
      if (rl) {
        await rl.question("");
        rl.close();
        await editor.stop();
        return 0;
      }
      return null;
    }
    case "desinstalar": {
      const rl = process.stdin.isTTY && !flags.sim ? createInterface({ input: process.stdin, output: process.stdout }) : null;
      const io = makeIo(ctx, rl);
      try {
        const r = await cmdDesinstalar(ctx, io);
        print(ctx, r, r.feito ? `\nPronto:\n${r.resumo.map((x) => `- ${x}`).join("\n")}` : "");
      } finally {
        rl?.close();
      }
      return 0;
    }
    case "publicar": {
      await cmdPublicar(ctx);
      return 0;
    }
    case "perfil": {
      const r = await cmdPerfil(ctx);
      print(ctx, { perfil: r.perfil, galerias: r.galerias, testes: r.testes, backup: r.backup }, r.texto);
      return 0;
    }
    case "setor": {
      const r = await cmdSetor(ctx);
      print(ctx, { detectado: r.detection, aplicado: r.applied }, r.texto);
      return 0;
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
