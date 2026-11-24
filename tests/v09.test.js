// Versão 0.9: instalador visual (janela com etapas, checkboxes das funcionalidades e etapa 2),
// funcionalidades liga/desliga (agente.recursos) e o executável "agente-instalador".
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { ROOT, exampleCopy } from "./helpers.js";
import { scanProject } from "../src/scanner/index.js";
import { generateKnowledge } from "../src/generator/index.js";
import { createAgent } from "../src/agent/agent.js";
import { checkKnowledge, activeView, RECURSOS } from "../src/agent/knowledge.js";
import { evaluateKnowledge } from "../src/eval/index.js";
import { startInstaller } from "../src/gui/server.js";
import { openWindow, appBrowsers, appArgs } from "../src/gui/janela.js";
import { setWindowsSubsystem } from "../scripts/build-exe.js";

const { resolveArgs, defaultCommand } = createRequire(import.meta.url)("../sea/launcher.cjs");
const FIX = join(ROOT, "tests", "fixtures", "construtora");
let cached;
const base = async () => (cached ||= generateKnowledge(await scanProject(join(ROOT, "examples", "loja-exemplo"))).knowledge);

test("recursos: faltando = ligado; false fica salvo; lista fixa", async () => {
  assert.deepEqual(RECURSOS, ["catalogo", "busca", "conta", "perfil", "formularios", "fotos", "fluxos"]);
  const k = await base();
  assert.ok(RECURSOS.every((id) => k.agente.recursos[id] === true));
  const { knowledge } = checkKnowledge({ ...k, agente: { ...k.agente, recursos: { catalogo: false, fotos: "não", xyz: false } } });
  assert.equal(knowledge.agente.recursos.catalogo, false);
  assert.equal(knowledge.agente.recursos.fotos, true, "só false de verdade desliga");
  assert.equal("xyz" in knowledge.agente.recursos, false);
});

test("vista ativa: desligar não apaga a base, só deixa de usar", async () => {
  const k = await base();
  assert.ok(k.catalogo.itens.length > 0 && k.intencoes.catalogo_ajuda);
  const off = { ...k, agente: { ...k.agente, recursos: { catalogo: false, formularios: false, fluxos: false } }, fluxos: [{ id: "f", gatilhos: ["quero um kit", "montar kit"], pergunta: "Qual?", opcoes: [{ rotulo: "A", resposta: "ok" }, { rotulo: "B", resposta: "ok" }] }] };
  const v = activeView(checkKnowledge(off).knowledge);
  assert.equal(v.catalogo.itens.length, 0);
  assert.equal(v.intencoes.catalogo_ajuda, undefined);
  assert.equal(v.interacoes.length, 0);
  assert.equal(v.fluxos.length, 0);
  assert.ok(!v.agente.sugestoes.some((s) => /^ver produtos$/i.test(s)));
  const agent = createAgent(off);
  assert.ok(agent.knowledge.catalogo.itens.length > 0, "createAgent().knowledge continua completa (aplicar-ia/gemini não perdem nada)");
  assert.equal(agent.recursos.catalogo, false);
  const r = agent.reply("quero um café até 50 reais");
  assert.equal((r.itens || []).length, 0);
  const on = createAgent(k).reply("quero um café até 50 reais");
  assert.ok(on.itens.length > 0);
  // A avaliação mede só o que está ligado.
  assert.ok(evaluateKnowledge(off).geral >= 90);
});

test("vista ativa: conta, busca, perfil e fotos", async () => {
  const k = generateKnowledge(await scanProject(FIX)).knowledge;
  const comPerfil = { ...k, perfil: { ...k.perfil, ativo: true }, consultas: { ...k.consultas, dados: [{ id: "pedidos", rotulo: "seus pedidos", url: "/api/pedidos", exemplos: ["meus pedidos", "status do pedido"] }], buscas: [{ id: "b", rotulo: "busca", modelo: "/busca?q={termo}", exemplos: ["procurar x", "buscar y"] }] } };
  const v = activeView(checkKnowledge({ ...comPerfil, agente: { ...k.agente, recursos: { conta: false, busca: false, perfil: false, fotos: false } } }).knowledge);
  assert.equal(v.consultas.dados.length, 0);
  assert.equal(v.consultas.buscas.length, 0);
  assert.equal(v.perfil.ativo, false);
  assert.equal(v.midias.galerias.length, 0);
  const todos = activeView(checkKnowledge(comPerfil).knowledge);
  assert.equal(todos.consultas.dados.length, 1);
  assert.equal(todos.perfil.ativo, true);
});

test("executável: 'instalador' no nome abre o instalador visual com --janela", () => {
  assert.equal(defaultCommand("C:/x/agente-instalador-windows.exe"), "instalador");
  assert.equal(defaultCommand("/x/agente-installer-linux"), "instalador");
  assert.equal(defaultCommand("agente-treinador-macos"), "treinar");
  assert.equal(defaultCommand("agente-gerador-linux"), "assistente");
  const dir = "/site";
  assert.deepEqual(resolveArgs([], dir, () => false, "agente-instalador-linux"), ["instalador", dir, "--janela"]);
  assert.deepEqual(resolveArgs(["/outro"], dir, () => true, "agente-instalador-linux"), ["instalador", "/outro", "--janela"]);
  assert.deepEqual(resolveArgs(["--porta", "4800"], dir, () => false, "agente-instalador-linux"), ["instalador", dir, "--janela", "--porta", "4800"]);
  assert.deepEqual(resolveArgs([], dir, () => false, "agente-gerador-linux"), ["assistente", dir]);
});

test("build: troca o subsistema do .exe (janela, sem terminal)", () => {
  const buf = Buffer.alloc(512);
  buf.writeUInt16LE(0x5a4d, 0);
  buf.writeUInt32LE(0x80, 0x3c);
  buf.writeUInt32LE(0x00004550, 0x80);
  buf.writeUInt16LE(0x20b, 0x80 + 24);
  buf.writeUInt16LE(3, 0x80 + 24 + 68);
  assert.equal(setWindowsSubsystem(buf, 2), 3);
  assert.equal(buf.readUInt16LE(0x80 + 24 + 68), 2);
  assert.throws(() => setWindowsSubsystem(Buffer.from("ELF....".padEnd(80))), /MZ/);
});

test("janela: Edge/Chrome em modo aplicativo; sem eles, navegador padrão", () => {
  const env = { ProgramFiles: "C:\\PF", "ProgramFiles(x86)": "C:\\PF86", LOCALAPPDATA: "C:\\L" };
  assert.ok(appBrowsers("win32", env)[0].endsWith("msedge.exe"));
  assert.ok(appArgs("http://127.0.0.1:1/?t=a").includes("--app=http://127.0.0.1:1/?t=a"));
  const calls = [];
  const run = (exe, args) => {
    calls.push([exe, args]);
    return { on() { return this; }, unref() {} };
  };
  assert.equal(openWindow("http://x/", { platform: "win32", env, exists: (p) => p.includes("Chrome"), run, fallback: () => true }), "janela");
  assert.ok(calls[0][0].includes("chrome.exe"));
  assert.equal(openWindow("http://x/", { platform: "linux", env: {}, exists: () => false, run, fallback: () => true }), "navegador");
});

// Servidor do instalador com operações de mentira: segurança, tarefas e sessão da etapa 2.
async function fakeInstaller(t, extra = {}) {
  let parar;
  const ops = {
    abrir: async (p) => ({ ctx: { p }, info: { pasta: p, temIndex: true } }),
    analisar: async (ctx, log) => {
      log("lendo", 50);
      return { resumo: { paginas: 3 }, recursos: [] };
    },
    instalar: async (ctx, escolhas, log) => {
      log("copiando", 60);
      return { ok: true, escolhas };
    },
    testar: async (ctx, mensagem) => ({ texto: `eco: ${mensagem}` }),
    abrirSite: async () => ({ url: "http://localhost:5173/", stop() {} }),
    sessao: async (ctx, modo, opcoes, io) => {
      io.print("     Abra http://localhost:4710/ e use o site");
      await io.waitEnter(new AbortController().signal);
      parar = true;
      return { texto: "ok", antes: 80, depois: 90, correcoes: 2, certas: 1 };
    },
    editor: async () => ({ url: "http://127.0.0.1:4720/?t=x", stop: async () => {} }),
    acerto: async () => 90,
  };
  let fim = null;
  const inst = await startInstaller({ ops, pasta: "/site", port: 0, versao: "0.9.0", onFim: (m) => (fim = m), ...extra });
  t.after(() => inst.stop());
  const origin = `http://127.0.0.1:${inst.port}`;
  const call = async (method, path, data, headers = {}) => {
    const res = await fetch(origin + path, { method, headers: { "content-type": "application/json", "x-instalador": inst.token, ...headers }, body: method === "POST" ? JSON.stringify(data || {}) : undefined });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return { inst, call, origin, fim: () => fim, parou: () => parar };
}
const until = async (fn) => {
  for (let i = 0; i < 100; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("tempo esgotado");
};

test("instalador: página só com o código da sessão; API recusa token, host e origem errados", async (t) => {
  const { inst, call, origin } = await fakeInstaller(t);
  assert.equal((await fetch(`${origin}/`)).status, 403);
  const page = await fetch(inst.url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /script-src 'self'/);
  assert.match(await page.text(), /app\.js/);
  assert.equal((await fetch(`${origin}/app.js`)).status, 200);
  assert.equal((await call("GET", "/api/estado", null, { "x-instalador": "errado" })).status, 403);
  assert.equal((await call("POST", "/api/analisar", {}, { origin: "http://evil.example" })).status, 403);
  const { request } = await import("node:http");
  const wrongHost = await new Promise((ok) => request(`${origin}/api/estado`, { headers: { host: "evil.example", "x-instalador": inst.token } }, (r) => ok(r.statusCode)).end());
  assert.equal(wrongHost, 421);
  const e = await call("GET", "/api/estado");
  assert.equal(e.body.versao, "0.9.0");
  assert.equal(e.body.info.pasta, "/site");
});

test("instalador: raio X e instalação viram tarefas acompanhadas; uma por vez", async (t) => {
  const { call } = await fakeInstaller(t);
  assert.equal((await call("POST", "/api/instalar", {})).status, 400, "instalar antes do raio X");
  assert.equal((await call("POST", "/api/analisar")).status, 200);
  const a = await until(async () => ((await call("GET", "/api/tarefa")).body.tarefa.status === "ok" ? (await call("GET", "/api/tarefa")).body.tarefa : null));
  assert.equal(a.resultado.resumo.paginas, 3);
  assert.equal(a.passos[0].texto, "lendo");
  await call("POST", "/api/instalar", { recursos: { catalogo: false } });
  const i = await until(async () => ((await call("GET", "/api/tarefa")).body.tarefa.status === "ok" ? (await call("GET", "/api/tarefa")).body.tarefa : null));
  assert.deepEqual(i.resultado.escolhas.recursos, { catalogo: false });
  assert.equal((await call("GET", "/api/estado")).body.acerto, 90);
  assert.equal((await call("POST", "/api/testar", { mensagem: "oi" })).body.texto, "eco: oi");
});

test("instalador: etapa 2 fica aberta até o botão Encerrar e devolve o resultado", async (t) => {
  const { call, parou } = await fakeInstaller(t);
  const s = await call("POST", "/api/sessao/iniciar", { modo: "treinar", minutos: 9999 });
  assert.equal(s.body.sessao.status, "rodando");
  const comUrl = await until(async () => (await call("GET", "/api/sessao")).body.sessao.url);
  assert.equal(comUrl, "http://localhost:4710/");
  assert.equal((await call("POST", "/api/analisar")).status, 409, "nada de tarefa nova com o treino aberto");
  assert.equal(parou(), undefined);
  await call("POST", "/api/sessao/parar");
  const fim = await until(async () => {
    const r = (await call("GET", "/api/sessao")).body.sessao;
    return r.status === "ok" ? r : null;
  });
  assert.deepEqual([fim.resultado.antes, fim.resultado.depois, fim.resultado.correcoes], [80, 90, 2]);
});

test("instalador: fecha pelo botão e sozinho quando a janela some (--janela)", async (t) => {
  const a = await fakeInstaller(t);
  await a.call("POST", "/api/sair");
  assert.equal(await until(async () => a.fim()), "botão Fechar");
  const b = await fakeInstaller(t, { vivoMs: 120 });
  assert.equal(await until(async () => b.fim()), "janela fechada");
});

// Ponta a ponta com o CLI de verdade: o mesmo roteiro do teste de fumaça do CI.
test("instalador (CLI): raio X, instala com catálogo desligado, conversa e fecha", async (t) => {
  const site = await exampleCopy(t);
  const child = spawn(process.execPath, [join(ROOT, "bin", "agent-generator.js"), "instalador", site, "--sem-navegador", "--porta", "4795"], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => child.kill());
  let out = "";
  child.stdout.on("data", (c) => (out += c));
  child.stderr.on("data", (c) => (out += c));
  const url = await until(async () => out.match(/http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]+/)?.[0]);
  const { origin, searchParams } = new URL(url);
  const headers = { "content-type": "application/json", "x-instalador": searchParams.get("t") };
  const call = async (method, path, data) => (await fetch(origin + path, { method, headers, body: method === "POST" ? JSON.stringify(data || {}) : undefined })).json();
  const task = () => until(async () => {
    const { tarefa } = await call("GET", "/api/tarefa");
    if (tarefa.status === "erro") throw new Error(tarefa.erro);
    return tarefa.status === "ok" ? tarefa.resultado : null;
  });
  await call("POST", "/api/analisar");
  const a = await task();
  assert.ok(a.resumo.paginas >= 4);
  const cat = a.recursos.find((r) => r.id === "catalogo");
  assert.ok(cat.disponivel && cat.padrao);
  assert.equal(a.recursos.find((r) => r.id === "conta").sensivel, true);
  await call("POST", "/api/instalar", { recursos: { catalogo: false }, agente: { nome: "Aurora", cor: "#0f766e", tom: "formal" }, inserir: true });
  const i = await task();
  assert.ok(i.inseridas.includes("index.html"));
  assert.ok(i.geral >= 90);
  const agente = JSON.parse(await readFile(join(site, "agente", "conhecimento", "agente.json"), "utf8"));
  assert.equal(agente.recursos.catalogo, false);
  assert.equal(agente.nome, "Aurora");
  assert.equal(agente.tom, "formal");
  assert.match(await readFile(join(site, "agente-gerador", "RESUMO.txt"), "utf8"), /instalador/);
  const r = await call("POST", "/api/testar", { mensagem: "quero um café até 50 reais" });
  assert.equal(r.itens.length, 0, "catálogo desligado");
  await call("POST", "/api/sair");
  const code = await new Promise((ok) => child.on("exit", ok));
  assert.equal(code, 0);
  assert.match(out, /Instalador encerrado \(botão Fechar\)/);
});
