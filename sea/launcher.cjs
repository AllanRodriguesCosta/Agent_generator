// Ponto de entrada do executável (Node "single executable application").
// O executável leva o agent-generator inteiro num único recurso ("pacote.json": caminho -> base64).
// Na primeira execução ele extrai os arquivos para uma pasta de cache do usuário e roda o CLI de
// lá, sem precisar de Node instalado. Sem argumentos (duplo clique), roda o modo assistente na
// pasta onde o executável está. Arrastar uma pasta sobre o executável também funciona.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");

function seaModule() {
  try {
    const sea = require("node:sea");
    return sea.isSea() ? sea : null;
  } catch {
    return null; // Node sem suporte a SEA
  }
}

function loadPackage() {
  const sea = seaModule();
  if (sea) return JSON.parse(sea.getAsset("pacote.json", "utf8"));
  // Fora do executável (testes): AGENTE_PACOTE aponta para o pacote gerado pelo build.
  const file = process.env.AGENTE_PACOTE;
  if (!file) throw new Error("Pacote não encontrado. Gere com: node scripts/build-exe.js");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function cacheBase(env = process.env, platform = process.platform) {
  if (env.AGENTE_CACHE) return env.AGENTE_CACHE;
  if (platform === "win32") return path.join(env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "agent-generator");
  if (platform === "darwin") return path.join(os.homedir(), "Library", "Caches", "agent-generator");
  return path.join(env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "agent-generator");
}

// Extrai só uma vez por versão (pasta com o hash do conteúdo). Nunca escreve fora da pasta.
function extract(pkg, base) {
  const dir = path.join(base, `${pkg.versao}-${pkg.hash}`);
  const ready = path.join(dir, ".pronto");
  if (fs.existsSync(ready)) return dir;
  const temp = `${dir}.tmp-${process.pid}`;
  fs.rmSync(temp, { recursive: true, force: true });
  for (const [rel, b64] of Object.entries(pkg.arquivos)) {
    const target = path.resolve(temp, rel);
    if (!target.startsWith(path.resolve(temp) + path.sep)) throw new Error(`Caminho inválido no pacote: ${rel}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(b64, "base64"));
  }
  fs.writeFileSync(path.join(temp, ".pronto"), pkg.hash);
  try {
    fs.renameSync(temp, dir);
  } catch (error) {
    // Outra execução simultânea já extraiu: usa a dela.
    fs.rmSync(temp, { recursive: true, force: true });
    if (!fs.existsSync(ready)) throw error;
  }
  return dir;
}

// Duplo clique: sem argumentos -> assistente na pasta do executável.
// Pasta arrastada sobre o executável -> assistente nessa pasta. Qualquer outra coisa -> CLI normal.
// Parte 2: o mesmo executável com "treinador" no nome abre o modo treino (comando treinar).
// Versão 0.9: "instalador" no nome abre o instalador visual (janela com etapas), sem terminal.
function defaultCommand(exeName = "") {
  const name = path.basename(String(exeName));
  if (/treinador|trainer/i.test(name)) return "treinar";
  if (/instalador|installer/i.test(name)) return "instalador";
  return "assistente";
}
function resolveArgs(args, exeDir, isDir = (p) => fs.existsSync(p) && fs.statSync(p).isDirectory(), exeName = "") {
  const command = defaultCommand(exeName);
  // O instalador aberto por duplo clique encerra sozinho quando a janela fecha (--janela).
  const extra = command === "instalador" ? ["--janela"] : [];
  if (!args.length) return [command, exeDir, ...extra];
  if (args.length === 1 && !args[0].startsWith("-") && isDir(args[0])) return [command, args[0], ...extra];
  // Só opções (inclusive com valor, como "--minutos 2"): o comando padrão na pasta do executável.
  if (args[0].startsWith("--")) return [command, exeDir, ...extra, ...args];
  return args;
}

// Sem terminal (instalador no Windows), um erro na partida vira uma página no navegador.
function showErrorPage(message, platform = process.platform) {
  const file = path.join(os.tmpdir(), "agent-generator-erro.html");
  const esc = String(message).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><title>Agent Generator - erro</title><body style="font:16px system-ui;margin:40px;max-width:720px"><h1>O instalador não conseguiu abrir</h1><p>${esc}</p><p>Dica: coloque o executável na pasta raiz do site (a que tem o index.html ou o package.json) e abra de novo.</p></body>`);
  const { spawn } = require("node:child_process");
  const [cmd, args] = platform === "win32" ? ["cmd", ["/c", "start", "", file]] : platform === "darwin" ? ["open", [file]] : ["xdg-open", [file]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true, windowsHide: true }).on("error", () => {}).unref();
  } catch {
    /* sem navegador: nada a fazer */
  }
  return file;
}

function hashOf(files) {
  const h = crypto.createHash("sha256");
  for (const key of Object.keys(files).sort()) h.update(key).update("\0").update(files[key]).update("\0");
  return h.digest("hex").slice(0, 12);
}

async function run() {
  const pkg = loadPackage();
  const dir = extract(pkg, cacheBase());
  // No executável, a pasta dele; rodando com "node sea/launcher.cjs" (testes), a pasta atual.
  const exeDir = seaModule() ? path.dirname(process.execPath) : process.cwd();
  const args = resolveArgs(process.argv.slice(2), exeDir, undefined, seaModule() ? process.execPath : process.env.AGENTE_NOME || "");
  // require() de módulo ES (Node 22.12+), a partir da pasta extraída.
  const cli = createRequire(path.join(dir, "package.json"))("./bin/agent-generator.js");
  const code = await cli.main(args);
  if (code != null) process.exitCode = code;
}

module.exports = { cacheBase, extract, resolveArgs, hashOf, defaultCommand, showErrorPage };

if (seaModule() || require.main === module) {
  run().catch(async (error) => {
    console.error(`Erro: ${error.message}`);
    process.exitCode = 1;
    if (!process.stdout.isTTY && seaModule() && defaultCommand(process.execPath) === "instalador") showErrorPage(error.message);
    // Janela aberta por duplo clique: espera Enter para a pessoa conseguir ler o erro.
    if (process.stdin.isTTY && !process.argv.includes("--sem-pausa")) {
      process.stdout.write("\nPressione Enter para fechar...");
      await new Promise((done) => process.stdin.once("data", done));
      process.stdin.pause();
    }
  });
}
