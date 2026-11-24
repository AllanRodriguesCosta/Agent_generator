// Versão 0.9: desinstalador. Encontra o agente criado pelo agent-generator e desfaz a instalação
// (widget fora das páginas, pasta do agente apagada, base guardada), pelo CLI, pelo assistente de
// terminal e pelo instalador visual.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { readFile, writeFile, mkdir, stat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, exampleCopy } from "./helpers.js";
import { removeTags, planUninstall, runUninstall, isAgentDir } from "../src/installer/uninstall.js";
import { MARKER } from "../src/installer/index.js";
import { runAssistant } from "../src/cli/assistente.js";

const cli = (...args) => spawnSync(process.execPath, [join(ROOT, "bin", "agent-generator.js"), ...args], { encoding: "utf8" });
const exists = (p) => stat(p).then(() => true, () => false);
const PAGES = ["index.html", "cardapio.html", "contato.html", "entrega.html", "sobre.html"];
async function installed(t) {
  const site = await exampleCopy(t);
  const originals = Object.fromEntries(await Promise.all(PAGES.map(async (p) => [p, await readFile(join(site, p), "utf8")])));
  const r = cli("criar", site, "--inserir");
  assert.equal(r.status, 0, r.stderr);
  return { site, originals };
}

test("removeTags: tira só o bloco do instalador (\\n e \\r\\n); o que foi colado à mão fica", () => {
  const block = `${MARKER}\n<link rel="stylesheet" href="/agente/widget.css">\n<script type="module" src="/agente/widget.js"></script>\n`;
  const html = `<html><body><p>oi</p>\n${block}</body></html>`;
  assert.deepEqual(removeTags(html), { html: "<html><body><p>oi</p>\n</body></html>", removido: true, sobrou: false });
  const crlf = html.replace(/\n/g, "\r\n");
  assert.equal(removeTags(crlf).html, "<html><body><p>oi</p>\r\n</body></html>");
  const manual = `<body><script type="module" src="/agente/widget.js"></script></body>`;
  assert.deepEqual(removeTags(manual), { html: manual, removido: false, sobrou: true });
});

test("desinstalar (CLI): sem --sim e sem terminal não mexe em nada", async (t) => {
  const { site } = await installed(t);
  const r = cli("desinstalar", site);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Agente encontrado/);
  assert.match(r.stdout, /Nada foi alterado/);
  assert.ok(await exists(join(site, "agente", "widget.js")));
});

test("desinstalar --sim: páginas voltam ao original, pasta do agente sai, base fica guardada", async (t) => {
  const { site, originals } = await installed(t);
  const r = cli("desinstalar", site, "--sim", "--json");
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.feito, true);
  assert.equal(out.pastaRemovida, "agente");
  assert.deepEqual(out.paginas.sort(), [...PAGES].sort());
  for (const p of PAGES) assert.equal(await readFile(join(site, p), "utf8"), originals[p], `${p} igual ao original`);
  assert.equal(await exists(join(site, "agente")), false);
  const base = JSON.parse(await readFile(join(site, out.baseGuardada), "utf8"));
  assert.ok(base.faq.length > 0 && base.agente);
  assert.match(await readFile(join(site, "agente-gerador", "DESINSTALACAO.txt"), "utf8"), /desinstalado/);
  const cfg = JSON.parse(await readFile(join(site, "agente-gerador", "config.json"), "utf8"));
  assert.equal(cfg.destino, undefined);
  // Depois de desinstalar, não há mais agente.
  assert.match(cli("desinstalar", site).stdout, /Não encontrei um agente/);
});

test("desinstalar --sim --tudo: apaga também agente-gerador/ e guarda a base na raiz", async (t) => {
  const { site } = await installed(t);
  const out = JSON.parse(cli("desinstalar", site, "--sim", "--tudo", "--json").stdout);
  assert.equal(out.trabalhoRemovido, true);
  assert.equal(await exists(join(site, "agente-gerador")), false);
  assert.match(out.baseGuardada, /^agente-base-.*\.json$/);
  assert.ok(await exists(join(site, out.baseGuardada)));
});

test("segurança: pasta agente/ que não é nossa nunca é apagada; linha colada à mão vira aviso", async (t) => {
  const site = await exampleCopy(t);
  await mkdir(join(site, "agente"), { recursive: true });
  await writeFile(join(site, "agente", "meu-arquivo.txt"), "do dono do site");
  assert.equal(await isAgentDir(join(site, "agente")), false);
  assert.equal((await planUninstall(site)).instalado, false);
  // Projeto React com a linha colada à mão num componente.
  const { site: s2 } = await installed(t);
  await mkdir(join(s2, "src"), { recursive: true });
  await writeFile(join(s2, "src", "Layout.jsx"), '<script type="module" src="/agente/widget.js"></script>');
  const plan = await planUninstall(s2);
  assert.deepEqual(plan.referencias, ["src/Layout.jsx"]);
  const r = await runUninstall(s2, plan);
  assert.deepEqual(r.pendentes, ["src/Layout.jsx"]);
  assert.match(await readFile(join(s2, "src", "Layout.jsx"), "utf8"), /widget\.js/, "arquivo que não escrevemos fica intacto");
  assert.ok(r.resumo.some((x) => /colado à mão/.test(x)));
});

test("config.json apontando para fora do projeto não leva a apagar nada fora", async (t) => {
  const { site } = await installed(t);
  const outside = await exampleCopy(t);
  cli("criar", outside);
  const plan = await planUninstall(site, { config: { destino: join(outside, "agente") } });
  assert.ok(plan.pasta.dir.startsWith(site));
});

test("assistente de terminal: com agente instalado, oferece desinstalar", async (t) => {
  const { site } = await installed(t);
  const printed = [];
  const io = {
    print: (x) => printed.push(x),
    ask: async (q) => /DESINSTALAR/.test(q),
    pause: async () => {},
  };
  const steps = {
    analisar: async () => ({ resumo: { paginas: 5, rotas: 0, formularios: 0, faq: 0, itensCatalogo: 0 }, projeto: { stack: [] } }),
    target: async () => ({ dir: join(site, "agente"), why: "teste" }),
    planoDesinstalar: () => planUninstall(site),
    desinstalar: (plan) => runUninstall(site, plan),
  };
  const r = await runAssistant({ project: site, work: join(site, "agente-gerador"), io, steps });
  assert.equal(r.status, "desinstalado");
  assert.equal(await exists(join(site, "agente")), false);
  assert.ok(printed.some((x) => /Agente desinstalado/.test(x)));
  // --sim (sem pessoa respondendo) nunca desinstala: soInterativo devolve não.
  const { site: s2 } = await installed(t);
  const r2 = cli("assistente", s2, "--sim", "--sem-pausa");
  assert.equal(r2.status, 0);
  assert.ok(await exists(join(s2, "agente", "widget.js")));
});

test("instalador visual: mostra que já existe agente e desinstala pela API", async (t) => {
  const { site, originals } = await installed(t);
  const child = spawn(process.execPath, [join(ROOT, "bin", "agent-generator.js"), "instalador", site, "--sem-navegador", "--porta", "4797"], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => child.kill());
  let out = "";
  child.stdout.on("data", (c) => (out += c));
  let url;
  for (let i = 0; i < 100 && !url; i++) {
    url = out.match(/http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]+/)?.[0];
    if (!url) await new Promise((r) => setTimeout(r, 50));
  }
  const { origin, searchParams } = new URL(url);
  const headers = { "content-type": "application/json", "x-instalador": searchParams.get("t") };
  const call = async (method, path, data) => (await fetch(origin + path, { method, headers, body: method === "POST" ? JSON.stringify(data || {}) : undefined })).json();
  const estado = await call("GET", "/api/estado");
  assert.equal(estado.info.instalado, true);
  assert.equal(estado.info.pastaAgente, "agente");
  const plano = await call("GET", "/api/desinstalar");
  assert.equal(plano.pasta.rel, "agente");
  assert.equal(plano.paginas.length, 5);
  assert.equal(plano.pasta.dir, undefined, "caminho absoluto não vai para a janela");
  await call("POST", "/api/desinstalar", { apagarTrabalho: false });
  let tarefa;
  for (let i = 0; i < 100; i++) {
    tarefa = (await call("GET", "/api/tarefa")).tarefa;
    if (tarefa.status !== "rodando") break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(tarefa.status, "ok", tarefa.erro);
  assert.equal(tarefa.resultado.pastaRemovida, "agente");
  for (const p of PAGES) assert.equal(await readFile(join(site, p), "utf8"), originals[p]);
  assert.equal((await call("GET", "/api/estado")).info.instalado, false);
  assert.ok((await readdir(join(site, "agente-gerador", "backup"))).some((f) => f.startsWith("conhecimento-desinstalado-")));
  await call("POST", "/api/sair");
});
