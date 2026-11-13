// Gera o executável do agent-generator para o sistema atual (Windows .exe, Linux ou macOS), usando
// o recurso "single executable application" do próprio Node. Precisa de Node 22.12+ (de preferência
// 24) e de internet na primeira vez (baixa a ferramenta postject pelo npx).
// Uso: node scripts/build-exe.js            -> dist/agente-gerador-windows.exe (ou -linux, -macos)
//      node scripts/build-exe.js --pacote   -> só dist/pacote.json (sem executável; usado nos testes)
import { mkdir, readdir, readFile, writeFile, copyFile, rm, chmod } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
// O que vai dentro do executável: o mesmo que o pacote npm publicaria.
export const INCLUDE = ["bin", "src", "widget", "templates", "package.json", "LICENSE"];
const FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

export function exeName(platform = process.platform) {
  return platform === "win32" ? "agente-gerador-windows.exe" : platform === "darwin" ? "agente-gerador-macos" : "agente-gerador-linux";
}

async function collect(path, out) {
  const full = join(ROOT, path);
  let entries;
  try {
    entries = await readdir(full, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOTDIR") throw error;
    out[path.split(sep).join("/")] = (await readFile(full)).toString("base64");
    return;
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name)))
    if (!e.name.startsWith(".")) await collect(join(path, e.name), out);
}

export async function buildPackage(outFile = join(DIST, "pacote.json")) {
  const arquivos = {};
  for (const item of INCLUDE) await collect(item, arquivos);
  const { version } = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  const { hashOf } = createRequire(import.meta.url)("../sea/launcher.cjs");
  const pkg = { versao: version, hash: hashOf(arquivos), arquivos };
  await mkdir(DIST, { recursive: true });
  await writeFile(outFile, JSON.stringify(pkg));
  return { file: outFile, files: Object.keys(arquivos).length, ...pkg, arquivos: undefined };
}

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  // No Windows o npx é um .cmd e precisa de shell; aspas protegem caminhos com espaço.
  const shell = process.platform === "win32" && cmd === "npx";
  execFileSync(cmd, shell ? args.map((a) => `"${a}"`) : args, { stdio: "inherit", cwd: ROOT, shell });
}

export async function buildExe() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error("Use Node 22.12 ou mais novo (de preferência 24) para gerar o executável.");
  const pkg = await buildPackage();
  console.log(`Pacote: ${pkg.files} arquivos, versão ${pkg.versao} (${pkg.hash}).`);
  const config = join(DIST, "sea-config.json");
  const blob = join(DIST, "sea-prep.blob");
  await writeFile(
    config,
    JSON.stringify({
      main: relative(ROOT, join(ROOT, "sea", "launcher.cjs")),
      output: relative(ROOT, blob),
      disableExperimentalSEAWarning: true,
      useCodeCache: false,
      useSnapshot: false,
      assets: { "pacote.json": relative(ROOT, pkg.file) },
    }),
  );
  run(process.execPath, ["--experimental-sea-config", relative(ROOT, config)]);
  const win = process.platform === "win32";
  const mac = process.platform === "darwin";
  // Nome com o sistema: um arquivo "agente-gerador" sem extensão colidiria com a pasta de trabalho
  // agente-gerador/ que o próprio executável cria no projeto.
  const exe = join(DIST, exeName());
  await rm(exe, { force: true });
  await copyFile(process.execPath, exe);
  if (!win) await chmod(exe, 0o755);
  if (mac) run("codesign", ["--remove-signature", exe]);
  run("npx", [
    "--yes",
    "postject@1.0.0-alpha.6",
    exe,
    "NODE_SEA_BLOB",
    blob,
    "--sentinel-fuse",
    FUSE,
    ...(mac ? ["--macho-segment-name", "NODE_SEA"] : []),
  ]);
  if (mac) run("codesign", ["--sign", "-", exe]);
  console.log(`\nExecutável pronto: ${exe}`);
  return exe;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const only = process.argv.includes("--pacote");
  (only ? buildPackage().then((p) => console.log(`Pacote: ${p.file} (${p.files} arquivos)`)) : buildExe()).catch((error) => {
    console.error(`Erro: ${error.message}`);
    process.exitCode = 1;
  });
}
