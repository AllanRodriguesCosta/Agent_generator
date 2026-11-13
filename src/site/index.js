// Versão 0.6: do site publicado ao serviço pronto. Lê o site pela URL (crawler), monta o espelho,
// roda o raio X normal sobre ele, gera a base e cria a pasta "agente-servico", que é publicada
// à parte (Render, Railway, Azure, um container...). O site só ganha duas linhas.
import { mkdir, writeFile, copyFile, readFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { crawlSite, writeMirror, cspAdvice } from "../crawler/index.js";
import { scanProject } from "../scanner/index.js";
import { generateKnowledge } from "../generator/index.js";
import { install, readKnowledge, writeKnowledge } from "../installer/index.js";
import { evaluateKnowledge } from "../eval/index.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const SERVICE_DIR = "agente-servico";
const json = (v) => `${JSON.stringify(v, null, 2)}\n`;

export const serviceSnippet = (host = "https://SEU-SERVICO") =>
  `<link rel="stylesheet" href="${host}/agente/widget.css">\n<script type="module" src="${host}/agente/widget.js"></script>`;

// Arquivos do serviço (pasta agente-servico/) e da raiz da pasta gerada, que pode virar um
// repositório: render.yaml aponta para agente-servico/ e a Action relê o site toda semana.
function serviceFiles(origin, host) {
  const name = `agente-${host.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}`.slice(0, 50);
  return {
    [`${SERVICE_DIR}/package.json`]: json({ name, private: true, type: "module", scripts: { start: "node servico.js" }, engines: { node: ">=20" } }),
    [`${SERVICE_DIR}/servico.config.json`]: json({ site: origin }),
    [`${SERVICE_DIR}/.env.exemplo`]: `# Copie para as variáveis do serviço de hospedagem (nunca para o repositório).\nORIGENS=${origin}\n# IA opcional (o agente funciona sem):\n# IA_PROVEDOR=gemini\n# IA_CHAVE=sua-chave-do-google-ai-studio\n# IA_MODELO=gemini-3.5-flash-lite\n# ou um modelo local, sem chave e sem enviar nada para fora:\n# IA_PROVEDOR=openai\n# IA_URL=http://localhost:11434/v1\n# IA_MODELO=llama3.2\n# CATALOGO_MIN=30\n`,
    [`${SERVICE_DIR}/Dockerfile`]: `FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nENV NODE_ENV=production\nEXPOSE 8787\nUSER node\nCMD ["node", "servico.js"]\n`,
    ".gitignore": "node_modules/\n.env\nfaltas.jsonl\nagente-gerador/backup/\n",
    "render.yaml": `services:\n  - type: web\n    name: ${name}\n    runtime: node\n    plan: free\n    rootDir: ${SERVICE_DIR}\n    buildCommand: echo "sem dependências"\n    startCommand: node servico.js\n    healthCheckPath: /saude\n    envVars:\n      - key: ORIGENS\n        value: ${origin}\n      - key: IA_PROVEDOR\n        sync: false\n      - key: IA_CHAVE\n        sync: false\n`,
    ".github/workflows/atualizar-agente.yml": `name: Atualizar agente

# Relê o site publicado toda segunda às 6h (UTC) e atualiza só páginas e catálogo da base,
# mantendo as edições. Se algo mudou, faz um commit; o Render publica sozinho.
on:
  schedule:
    - cron: "0 6 * * 1"
  workflow_dispatch:

permissions:
  contents: write

jobs:
  atualizar:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - name: Reler o site
        run: npx -y github:AllanRodriguesCosta/Agent_generator site ${origin} . --sim --so-conteudo
      - name: Salvar se mudou
        run: |
          git config user.name "agent-generator"
          git config user.email "agent-generator@users.noreply.github.com"
          git add -A
          git diff --cached --quiet || git commit -m "Agente: conteúdo do site atualizado" && git push
`,
    "LEIA-ME.md": `# Agente de ${host}

Gerado pelo agent-generator a partir do site publicado (${origin}), sem acesso ao código.

- \`${SERVICE_DIR}/\`: o serviço do agente (Node 20+, sem dependências). É o que vai para o ar.
- \`${SERVICE_DIR}/agente/conhecimento/\`: a base (perguntas, páginas, catálogo, intenções).
- Os arquivos .html desta pasta são a cópia das páginas públicas lidas (o "espelho").
- \`agente-gerador/\`: relatório do raio X e configurações.

## Testar no computador
    cd ${SERVICE_DIR}
    node servico.js
Abra http://localhost:8787 (mostra as duas linhas para colar no site) e
http://localhost:8787/saude.

## Publicar (exemplo: Render, plano gratuito)
1. Suba esta pasta inteira para um repositório no GitHub.
2. No Render: New > Blueprint > escolha o repositório (usa o render.yaml).
3. Confira a variável ORIGENS (o endereço do seu site). A IA é opcional.
4. Cole no site, antes de </body>, trocando o endereço pelo do serviço:

${serviceSnippet()}

Nada no site precisa sair do ar: é só incluir as duas linhas (muitas plataformas deixam
fazer isso pelo painel, em "código personalizado" ou "scripts").

Se o site usa Content-Security-Policy (cabeçalho ou meta tag), acrescente o endereço do
serviço em script-src, style-src e connect-src; senão o navegador bloqueia o widget.

Outras opções: Docker (\`${SERVICE_DIR}/Dockerfile\`), Railway, Fly.io, Azure App Service ou
qualquer servidor com Node 20.

## Atualizar o conteúdo
- Catálogo: se o site tem uma API pública de produtos liberada no robots.txt, o serviço relê
  sozinho a cada 30 min (CATALOGO_MIN).
- Páginas e catálogo pelo site: a Action \`.github/workflows/atualizar-agente.yml\` roda toda
  semana (ou à mão em Actions). No computador:
  \`npx github:AllanRodriguesCosta/Agent_generator site ${origin} . --sim --so-conteudo\`
- Editar a base: \`npx github:AllanRodriguesCosta/Agent_generator editar .\`
- O que o agente não entendeu: \`${SERVICE_DIR}/faltas.jsonl\` (anonimizado) e
  \`npx github:AllanRodriguesCosta/Agent_generator aprender . --arquivo ${SERVICE_DIR}/faltas.jsonl\`.
  Em hospedagem gratuita esse arquivo some a cada novo deploy.

## Dados
- O agente roda neste serviço; as conversas não vão para terceiros.
- Com IA_PROVEDOR, só as frases que o agente não entendeu vão à IA, sem e-mail, telefone,
  documentos ou códigos, e a IA só reescreve o pedido: a resposta sai da base do site.
  Com um modelo local (Ollama), nada sai do seu servidor.
`,
  };
}

export async function buildFromSite(url, outDir, { maxPages = 60, delayMs = 400, render, fetchImpl = fetch, log = () => {}, force = false, soConteudo = false } = {}) {
  const out = resolve(outDir);
  await mkdir(out, { recursive: true });
  const crawl = await crawlSite(url, { maxPages, delayMs, render, fetchImpl, log });
  if (!crawl.pages.length) throw new Error(crawl.avisos.at(-1) || "Nenhuma página lida.");
  const map = await writeMirror(out, crawl);
  const work = join(out, "agente-gerador");
  await mkdir(work, { recursive: true });
  const host = new URL(crawl.origin).host;
  await writeFile(join(work, "espelho.json"), json({ origem: crawl.origin, lidoEm: new Date().toISOString(), paginas: crawl.pages.length, produtos: crawl.products.length, catalogoApi: crawl.catalogApi, mapa: map, avisos: crawl.avisos }));

  const report = await scanProject(out);
  // Caminhos do espelho voltam a ser os do site (sobre/index.html -> /sobre).
  const hrefs = new Map();
  for (const p of report.paginas)
    if (map[p.arquivo]) {
      hrefs.set(p.href, map[p.arquivo]);
      p.href = map[p.arquivo];
    }
  for (const f of report.faq)
    if (f.link) {
      const [base, hash] = f.link.split("#");
      if (hrefs.has(base)) f.link = `${hrefs.get(base)}${hash ? `#${hash}` : ""}`;
    }
  report.projeto.url = crawl.origin;
  if (/^[\w.-]+$/.test(report.projeto.nome) && report.projeto.nome === out.split(/[\\/]/).pop()) report.projeto.nome = host;
  if (crawl.catalogApi) report.catalogoApi = crawl.catalogApi;
  const csp = cspAdvice(crawl.csp);
  report.avisos.unshift(...crawl.avisos, ...(csp ? [csp] : []));
  if (crawl.products.length) report.avisos = report.avisos.filter((a) => !/^(Sem|Nenhum) catálogo/.test(a));
  await writeFile(join(work, "relatorio.json"), json(report));

  const { knowledge, notes } = generateKnowledge(report);
  if (crawl.catalogApi) knowledge.catalogo = { ...knowledge.catalogo, url: crawl.catalogApi };
  knowledge.agente = { ...knowledge.agente, endpoint: "../api/agente" };

  const serviceDir = join(out, SERVICE_DIR);
  const target = { dir: join(serviceDir, "agente"), publicPath: "/agente/", why: "modo serviço" };
  let written = [];
  if (soConteudo && Object.keys(await readKnowledge(target.dir)).length) {
    written = (await writeKnowledge(target.dir, { catalogo: knowledge.catalogo, paginas: knowledge.paginas }, { force: true })).written;
  } else written = (await install(out, knowledge, { target, force })).written;
  await copyFile(join(ROOT, "templates", "servico.js"), join(serviceDir, "servico.js"));
  for (const [file, content] of Object.entries(serviceFiles(crawl.origin, host))) {
    // Arquivos que o dono pode ter ajustado (render.yaml, LEIA-ME...) só são recriados com --forcar.
    const exists = await readFile(join(out, file)).then(() => true, () => false);
    if (!exists || force || file.endsWith("servico.config.json")) {
      await mkdir(dirname(join(out, file)), { recursive: true });
      await writeFile(join(out, file), content);
    }
  }
  const prev = await readFile(join(work, "config.json"), "utf8").then(JSON.parse, () => ({}));
  await writeFile(join(work, "config.json"), json({ ...prev, destino: `${SERVICE_DIR}/agente`, publicPath: "/agente/", site: crawl.origin, modo: "servico" }));
  const avaliacao = evaluateKnowledge(await readKnowledge(target.dir));
  return { origem: crawl.origin, csp: Boolean(crawl.csp), paginas: crawl.pages.length, produtos: crawl.products.length, catalogoApi: crawl.catalogApi, faq: report.faq.length, avisos: [...new Set([...report.avisos, ...notes])], servico: serviceDir, escritos: written, geral: avaliacao.geral, snippet: serviceSnippet() };
}
