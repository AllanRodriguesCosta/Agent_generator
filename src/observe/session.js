// Sessão de observação/treino (versão 0.3): descobre onde o site está rodando (ou sobe ele),
// abre o proxy com o gravador e espera a pessoa terminar (botão Concluir, Enter ou tempo).
import { spawn, execFile } from "node:child_process";
import { request } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createObserver, localTarget } from "./proxy.js";

export const COMMON_PORTS = [3000, 5173, 8080, 4173, 8000, 5000, 4200, 3001];

export function probe(url, timeout = 1500) {
  return new Promise((resolve) => {
    const r = request(url, { method: "GET", timeout }, (res) => {
      res.resume();
      resolve(res.statusCode < 500);
    });
    r.on("timeout", () => r.destroy());
    r.on("error", () => resolve(false));
    r.end();
  });
}

// Endereço local que aparece na saída do "npm run dev" (Vite, Next, Express...).
export function urlFromOutput(text) {
  // eslint-disable-next-line no-control-regex -- cores ANSI da saída do terminal
  const m = String(text).replace(/\x1b\[[0-9;]*m/g, "").match(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0):(\d{2,5})/);
  return m ? `http://localhost:${m[1]}/` : null;
}

export async function devScript(project) {
  try {
    const pkg = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
    const name = ["dev", "start", "serve", "preview"].find((s) => pkg.scripts?.[s]);
    return name ? { name, command: pkg.scripts[name] } : null;
  } catch {
    return null;
  }
}

function stopChild(child) {
  if (!child || child.exitCode != null) return;
  if (process.platform === "win32") execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => {});
  else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}

// Sobe o projeto com "npm run <script>" e espera o endereço aparecer (até 90 s).
export function startProject(project, script, { timeout = 90_000, log = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(npm, ["run", script], { cwd: project, shell: process.platform === "win32", detached: process.platform !== "win32", env: { ...process.env, BROWSER: "none", FORCE_COLOR: "0" } });
    let output = "";
    const timer = setTimeout(async () => {
      for (const port of COMMON_PORTS) if (await probe(`http://localhost:${port}/`)) return resolve({ url: `http://localhost:${port}/`, stop: () => stopChild(child) });
      stopChild(child);
      reject(new Error(`O projeto não mostrou um endereço local em ${Math.round(timeout / 1000)} s. Inicie o site e use --url http://localhost:PORTA.`));
    }, timeout);
    const onData = (chunk) => {
      output += chunk;
      log(String(chunk));
      const url = urlFromOutput(output);
      if (url) {
        clearTimeout(timer);
        // Espera o servidor aceitar conexões de fato.
        const until = Date.now() + 20_000;
        const wait = async () => ((await probe(url)) || Date.now() > until ? resolve({ url, stop: () => stopChild(child) }) : setTimeout(wait, 400));
        wait();
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (!urlFromOutput(output)) reject(new Error(`"npm run ${script}" terminou (código ${code}) sem subir o site. Rode o projeto e use --url.`));
    });
  });
}

/**
 * Decide o endereço do site: --url, endereço salvo, site estático (servido aqui), npm run dev
 * (com permissão) ou uma porta comum já aberta. io: { print, ask, question }.
 */
export async function findUpstream({ project, flags = {}, config = {}, io, staticRoot, serveStatic }) {
  if (flags.url) return { url: localTarget(flags.url).href, stop: () => {}, origem: "--url" };
  if (config.url && (await probe(config.url))) return { url: config.url, stop: () => {}, origem: "endereço salvo" };
  if (staticRoot) {
    const { url, stop } = await serveStatic(staticRoot);
    return { url, stop, origem: "site estático servido pelo Agent Generator" };
  }
  for (const port of COMMON_PORTS) {
    const url = `http://localhost:${port}/`;
    if (await probe(url, 600)) {
      if (await io.ask(`     Encontrei um site rodando em ${url}. É o seu projeto?`, true)) return { url, stop: () => {}, origem: "porta aberta" };
    }
  }
  const script = await devScript(project);
  if (script && (await io.ask(`     Posso iniciar o seu projeto com "npm run ${script.name}" (${script.command})?`, true, { soInterativo: true }))) {
    io.print(`     Iniciando "npm run ${script.name}"... (pode levar alguns segundos)`);
    const started = await startProject(project, script.name);
    return { ...started, origem: `npm run ${script.name}` };
  }
  if (io.question) {
    const typed = (await io.question("     Em qual endereço o site está rodando? (ex.: http://localhost:3000) ")).trim();
    if (typed) return { url: localTarget(typed).href, stop: () => {}, origem: "informado" };
  }
  throw new Error("Não encontrei o site rodando. Inicie o projeto (ex.: npm run dev) e rode de novo com --url http://localhost:PORTA.");
}

/**
 * Abre o proxy e espera o fim: botão Concluir na página, Enter no terminal (waitEnter) ou tempo.
 * Devolve { events, exchanges, motivo, url }.
 */
export async function runSession({ upstream, port = 4700, minutos = 5, inject, routes = {}, io, listenFree, open, waitEnter }) {
  let finish;
  const ended = new Promise((resolve) => (finish = resolve));
  const obs = createObserver({ target: upstream, inject, routes, onEnd: (motivo) => finish(motivo) });
  const p = await listenFree(obs.server, port);
  const url = `http://localhost:${p}/`;
  io.print(`     Abra ${url} e use o site como um cliente usaria (o navegador deve abrir sozinho).`);
  io.print(`     Termine no botão "Concluir" da página${waitEnter ? ", com Enter aqui" : ""} ou espere ${minutos} min.`);
  open?.(url);
  const timer = setTimeout(() => finish("tempo"), minutos * 60_000);
  const abort = new AbortController();
  if (waitEnter) waitEnter(abort.signal).then(() => finish("enter"), () => {});
  const onSigint = () => finish("ctrl+c");
  process.once("SIGINT", onSigint);
  const motivo = await ended;
  clearTimeout(timer);
  abort.abort();
  process.removeListener("SIGINT", onSigint);
  // Dá meio segundo para os últimos eventos chegarem antes de fechar.
  await new Promise((r) => setTimeout(r, 500));
  const closed = new Promise((r) => obs.server.close(() => r()));
  obs.server.closeAllConnections?.();
  await closed;
  return { events: obs.events, exchanges: obs.exchanges, motivo, url };
}
