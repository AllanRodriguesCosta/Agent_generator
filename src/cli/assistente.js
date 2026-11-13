// Modo assistente: o processo inteiro, guiado por perguntas de sim/não. É o que o executável roda
// quando recebe um duplo clique na pasta raiz do projeto. Os passos (analisar, gerar...) vêm do
// CLI, para este arquivo só cuidar da conversa com a pessoa e do resumo final.
import { writeFile, mkdir, access } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { spawn } from "node:child_process";

const exists = (p) => access(p).then(() => true, () => false);
const FRAMEWORKS = ["Next.js", "Nuxt", "SvelteKit", "Astro", "Angular"];

// Pasta que um servidor estático simples consegue servir com o agente funcionando.
export async function staticRoot(project, entries) {
  if (await exists(join(project, "index.html"))) return project;
  const pub = entries.find((f) => /[\\/]public[\\/]index\.html$/.test(f));
  return pub ? dirname(pub) : null;
}

export function openBrowser(url, platform = process.platform) {
  const [cmd, args] =
    platform === "win32" ? ["cmd", ["/c", "start", "", url]] : platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
    return true;
  } catch {
    return false;
  }
}

export function summaryText(lines) {
  return `${lines.join("\n")}\n`;
}

/**
 * Executa o fluxo guiado.
 * io: { print(texto), ask(pergunta, padrão, { soInterativo }) -> Promise<boolean>, pause() }
 *     Sem terminal (ou com --sim) ask devolve o padrão; com soInterativo, devolve false.
 * steps: { analisar, target, gerar({force}), instalar({report}), entryPages, inject(backupDir, publicPath),
 *          avaliar, gemini, conversar, servir(pasta) -> url }
 * Devolve { status: "concluido" | "cancelado" | "servindo", resumo }.
 */
export async function runAssistant({ project, work, io, steps, hasGemini = false }) {
  const done = [];
  const rel = (f) => relative(project, f).split("\\").join("/") || ".";
  io.print("============================================================");
  io.print(" Agent Generator - criação automática do agente do seu site");
  io.print("============================================================");
  io.print(`Pasta do projeto: ${project}\n`);

  io.print("1/5  Fazendo o raio X do projeto (só leitura)...");
  const report = await steps.analisar();
  const r = report.resumo;
  io.print(
    `     ${r.paginas} páginas, ${r.rotas} rotas, ${r.formularios} formulários, ${r.faq} perguntas frequentes, ${r.itensCatalogo} itens de catálogo.`,
  );
  io.print(`     Tipo: ${report.projeto.stack.join(", ") || "site estático (HTML)"}`);
  const looksWeb = r.paginas > 0 || report.projeto.stack.length > 0 || (await exists(join(project, "package.json")));
  if (!looksWeb) {
    io.print("\n     Não encontrei páginas nem package.json aqui. O executável deve ficar na pasta RAIZ do site");
    io.print("     (a que tem o index.html ou o package.json).");
    if (!(await io.ask("     Continuar mesmo assim?", false))) return finish("cancelado");
  }

  const target = await steps.target(report);
  const hasBase = await exists(join(target.dir, "conhecimento", "faq.json"));
  io.print(`\n2/5  O agente vai ficar em: ${rel(target.dir)}/  (${target.why})`);
  let force = false;
  if (hasBase) {
    io.print("     Já existe uma base de conhecimento ali (talvez editada à mão).");
    force = await io.ask("     Regerar a base do zero? A atual vai para agente-gerador/backup.", false);
  }
  if (!(await io.ask("     Criar/atualizar o agente agora?", true))) return finish("cancelado");

  const g = await steps.gerar({ force });
  const inst = await steps.instalar({ report });
  done.push(`Agente instalado em ${rel(inst.dir)}/ (núcleo, widget e base em conhecimento/).`);
  if (g.kept.length && !force) done.push("Base existente mantida (nada do que você editou foi apagado).");
  else done.push("Base de conhecimento criada a partir do raio X.");
  if (g.backup) done.push(`Backup da base anterior: ${rel(g.backup)}`);

  io.print("\n3/5  Ligando o widget nas páginas...");
  const entries = await steps.entryPages();
  const framework = report.projeto.stack.find((s) => FRAMEWORKS.includes(s));
  let howTo = "";
  if (entries.length && !framework) {
    const names = entries.map(rel);
    const shown = names.slice(0, 5).join(", ") + (names.length > 5 ? ` e mais ${names.length - 5}` : "");
    if (await io.ask(`     Inserir a linha do widget em ${names.length} página(s) (${shown})? Uma cópia de cada vai para agente-gerador/backup/html.`, true)) {
      const res = await steps.inject(join(work, "backup", "html"), inst.publicPath);
      done.push(
        res.changed.length
          ? `Linha do widget inserida em: ${res.changed.map(rel).join(", ")}.`
          : "As páginas já tinham a linha do widget.",
      );
    } else howTo = inst.snippet;
  } else howTo = inst.snippet;
  if (howTo) {
    await mkdir(work, { recursive: true });
    await writeFile(join(work, "COMO-LIGAR.txt"), `${howTo}\n`);
    io.print(`     Falta um passo manual (seu projeto usa ${framework || "um formato sem index.html na raiz"}):\n${howTo.replace(/^/gm, "     ")}`);
    done.push(`Ligar o widget: veja agente-gerador/COMO-LIGAR.txt.`);
  }

  io.print("\n4/5  Testando a base com as próprias perguntas...");
  let ev = await steps.avaliar();
  io.print(`     Acerto: ${ev.geral ?? "-"}%  (detalhes em agente-gerador/avaliacao.txt)`);
  if (hasGemini && (await io.ask("     GEMINI_API_KEY encontrada. Melhorar a base com o Gemini (gratuito)?", false))) {
    try {
      const gm = await steps.gemini();
      ev = await steps.avaliar();
      done.push(`Gemini: +${gm.changes.exemplos} exemplos e +${gm.changes.faqNovas} perguntas. Acerto agora: ${ev.geral}%.`);
      io.print(`     Acerto com o Gemini: ${ev.geral}%`);
    } catch (error) {
      io.print(`     Gemini não respondeu (${error.message}). A base sem IA continua valendo.`);
    }
  }
  done.push(`Acerto da base: ${ev.geral ?? "-"}% (agente-gerador/avaliacao.txt).`);

  const next = [
    "Edite as respostas em " + `${rel(inst.dir)}/conhecimento/*.json (faq.json é o mais importante).`,
    "Para melhorar com uma IA de chat: cole agente-gerador/PROMPT-IA.md na IA e rode o comando aplicar-ia.",
    "Quando o site mudar, rode de novo: sem regerar, o que você editou fica; regerando, a base atual vai para agente-gerador/backup.",
  ];
  await writeResumo();

  io.print("\n5/5  Testar");
  const root = await staticRoot(project, entries);
  if (root && !framework && (await io.ask("     Abrir o site no navegador agora, com o agente?", true, { soInterativo: true }))) {
    const url = await steps.servir(root);
    io.print("\nPronto! Resumo salvo em agente-gerador/RESUMO.txt:");
    for (const d of done) io.print(`  - ${d}`);
    io.print(`     Site em ${url}  -  feche esta janela (ou Ctrl+C) para parar.`);
    if (!openBrowser(url)) io.print("     Abra o endereço acima no navegador.");
    return { status: "servindo", url, resumo: done };
  }
  if (await io.ask("     Conversar com o agente aqui no terminal?", false, { soInterativo: true })) await steps.conversar();
  return finish("concluido");

  async function writeResumo() {
    const text = summaryText([
      `Agent Generator - ${new Date().toLocaleString("pt-BR")}`,
      `Projeto: ${project}`,
      "",
      "Feito:",
      ...done.map((d) => `- ${d}`),
      "",
      "Próximos passos:",
      ...next.map((n) => `- ${n}`),
    ]);
    await mkdir(work, { recursive: true });
    await writeFile(join(work, "RESUMO.txt"), text);
  }

  async function finish(status) {
    if (status === "concluido") {
      io.print("\nPronto! Resumo salvo em agente-gerador/RESUMO.txt:");
      for (const d of done) io.print(`  - ${d}`);
    } else io.print("\nNada foi alterado no projeto.");
    await io.pause();
    return { status, resumo: done };
  }
}
