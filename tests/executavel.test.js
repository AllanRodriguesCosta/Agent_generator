import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile, mkdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT, exampleCopy } from "./helpers.js";
import { buildPackage, INCLUDE } from "../scripts/build-exe.js";
import { runAssistant, staticRoot } from "../src/cli/assistente.js";

const { resolveArgs, extract, cacheBase, hashOf } = createRequire(import.meta.url)("../sea/launcher.cjs");
const exists = (p) => access(p).then(() => true, () => false);

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), "agent-exe-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("executável: duplo clique, pasta arrastada e CLI normal", () => {
  const isDir = (p) => p === "/projetos/site";
  assert.deepEqual(resolveArgs([], "/pasta/do/exe", isDir), ["assistente", "/pasta/do/exe"]);
  assert.deepEqual(resolveArgs(["/projetos/site"], "/exe", isDir), ["assistente", "/projetos/site"]);
  assert.deepEqual(resolveArgs(["--sim", "--sem-pausa"], "/exe", isDir), ["assistente", "/exe", "--sim", "--sem-pausa"]);
  assert.deepEqual(resolveArgs(["avaliar", "."], "/exe", isDir), ["avaliar", "."]);
  assert.deepEqual(resolveArgs(["ajuda"], "/exe", isDir), ["ajuda"]);
});

test("executável: cache por sistema e extração protegida", async (t) => {
  assert.match(cacheBase({ LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local" }, "win32"), /agent-generator$/);
  assert.equal(cacheBase({ AGENTE_CACHE: "/x" }, "linux"), "/x");
  const base = await tempDir(t);
  const arquivos = { "a/b.txt": Buffer.from("oi").toString("base64") };
  const dir = extract({ versao: "1.0.0", hash: hashOf(arquivos), arquivos }, base);
  assert.equal(await readFile(join(dir, "a", "b.txt"), "utf8"), "oi");
  assert.equal(extract({ versao: "1.0.0", hash: hashOf(arquivos), arquivos }, base), dir, "segunda vez reaproveita");
  const evil = { "../fora.txt": "eA==" };
  assert.throws(() => extract({ versao: "1", hash: "mal", arquivos: evil }, base), /Caminho inválido/);
  assert.equal(await exists(join(base, "fora.txt")), false);
});

test("pacote do executável leva só o necessário", async (t) => {
  const out = join(await tempDir(t), "pacote.json");
  const info = await buildPackage(out);
  const pkg = JSON.parse(await readFile(out, "utf8"));
  const names = Object.keys(pkg.arquivos);
  assert.equal(info.files, names.length);
  assert.ok(names.includes("bin/agent-generator.js"));
  assert.ok(names.includes("src/cli/assistente.js"));
  assert.ok(names.includes("widget/widget.js"));
  assert.ok(names.includes("package.json"));
  assert.ok(names.every((n) => INCLUDE.some((i) => n === i || n.startsWith(`${i}/`))), "nada de testes, exemplos ou .demo");
  assert.match(pkg.hash, /^[0-9a-f]{12}$/);
});

test("executável (lançador + pacote) faz o processo inteiro na pasta do projeto", async (t) => {
  const site = await exampleCopy(t);
  const work = await tempDir(t);
  const pacote = join(work, "pacote.json");
  await buildPackage(pacote);
  const env = { ...process.env, AGENTE_PACOTE: pacote, AGENTE_CACHE: join(work, "cache") };
  const r = spawnSync(process.execPath, [join(ROOT, "sea", "launcher.cjs"), "--sim", "--sem-pausa"], { cwd: site, env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1\/5 {2}Fazendo o raio X/);
  assert.match(r.stdout, /Pronto! Resumo salvo/);
  assert.ok(await exists(join(site, "agente", "conhecimento", "faq.json")));
  assert.ok(await exists(join(site, "agente-gerador", "backup", "html", "index.html")), "HTML original guardado");
  assert.match(await readFile(join(site, "index.html"), "utf8"), /agente: agent-generator/);
  const resumo = await readFile(join(site, "agente-gerador", "RESUMO.txt"), "utf8");
  assert.match(resumo, /Acerto da base: \d+%/);

  // Rodar de novo não duplica a linha nem apaga a base editada.
  const faq = join(site, "agente", "conhecimento", "faq.json");
  const edited = JSON.parse(await readFile(faq, "utf8"));
  edited[0].resposta = "Resposta editada à mão.";
  await writeFile(faq, JSON.stringify(edited));
  const again = spawnSync(process.execPath, [join(ROOT, "sea", "launcher.cjs"), "--sim", "--sem-pausa"], { cwd: site, env, encoding: "utf8" });
  assert.equal(again.status, 0, again.stderr);
  assert.equal(JSON.parse(await readFile(faq, "utf8"))[0].resposta, "Resposta editada à mão.");
  assert.equal((await readFile(join(site, "index.html"), "utf8")).split("agente: agent-generator").length, 2);

  // O mesmo executável também aceita os comandos do CLI.
  const chat = spawnSync(process.execPath, [join(ROOT, "sea", "launcher.cjs"), "conversar", site, "oi", "--json"], { env, encoding: "utf8" });
  assert.equal(chat.status, 0, chat.stderr);
  assert.equal(JSON.parse(chat.stdout)[0].intencao, "saudacao");
});

function fakeIo(answers = {}) {
  const lines = [];
  return {
    lines,
    io: {
      print: (t) => lines.push(t),
      ask: async (q, fallback) => {
        const key = Object.keys(answers).find((k) => q.includes(k));
        lines.push(`? ${q}`);
        return key ? answers[key] : fallback;
      },
      pause: async () => lines.push("[pausa]"),
    },
  };
}

test("assistente: pasta que não é site pergunta antes e pode cancelar sem alterar nada", async (t) => {
  const dir = await tempDir(t);
  const { io, lines } = fakeIo({ "Continuar mesmo assim": false });
  const steps = {
    analisar: async () => ({ resumo: { paginas: 0, rotas: 0, formularios: 0, faq: 0, itensCatalogo: 0 }, projeto: { stack: [] } }),
    target: () => assert.fail("não deveria seguir"),
  };
  const r = await runAssistant({ project: dir, work: join(dir, "agente-gerador"), io, steps });
  assert.equal(r.status, "cancelado");
  assert.ok(lines.some((l) => /pasta RAIZ do site/.test(l)));
  assert.ok(lines.includes("[pausa]"));
  assert.equal(await exists(join(dir, "agente-gerador")), false);
});

test("assistente: em framework (Next.js) não mexe no HTML e salva COMO-LIGAR.txt", async (t) => {
  const dir = await tempDir(t);
  await mkdir(join(dir, "public"));
  const calls = [];
  const { io } = fakeIo();
  const steps = {
    analisar: async () => ({ resumo: { paginas: 3, rotas: 1, formularios: 0, faq: 2, itensCatalogo: 0 }, projeto: { stack: ["Next.js", "React"] } }),
    target: async () => ({ dir: join(dir, "public", "agente"), publicPath: "/agente/", why: "public/" }),
    gerar: async () => (calls.push("gerar"), { kept: [], backup: null }),
    instalar: async () => (calls.push("instalar"), { dir: join(dir, "public", "agente"), publicPath: "/agente/", snippet: "Next.js: em app/layout..." }),
    entryPages: async () => [join(dir, "public", "index.html")],
    inject: async () => assert.fail("não deveria inserir em Next.js"),
    avaliar: async () => ({ geral: 91 }),
    servir: async () => assert.fail("não deveria servir"),
    conversar: async () => calls.push("conversar"),
  };
  const r = await runAssistant({ project: dir, work: join(dir, "agente-gerador"), io, steps });
  assert.equal(r.status, "concluido");
  assert.deepEqual(calls, ["gerar", "instalar"]);
  assert.match(await readFile(join(dir, "agente-gerador", "COMO-LIGAR.txt"), "utf8"), /Next\.js/);
  assert.match(await readFile(join(dir, "agente-gerador", "RESUMO.txt"), "utf8"), /Acerto da base: 91%/);
});

test("assistente: escolhe a pasta servível (raiz ou public/)", async (t) => {
  const dir = await tempDir(t);
  assert.equal(await staticRoot(dir, []), null);
  assert.equal(await staticRoot(dir, [join(dir, "public", "index.html")]), join(dir, "public"));
  await writeFile(join(dir, "index.html"), "<html></html>");
  assert.equal(await staticRoot(dir, []), dir);
});
