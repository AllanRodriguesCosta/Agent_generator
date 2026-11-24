// Versão 0.9: abre o instalador numa janela própria, sem barra de endereço (Edge ou Chrome em
// modo aplicativo, "--app=URL"). Sem nenhum dos dois, usa o navegador padrão.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { openBrowser } from "../cli/assistente.js";

// Onde procurar um navegador com modo aplicativo em cada sistema (em ordem de preferência).
export function appBrowsers(platform = process.platform, env = process.env) {
  if (platform === "win32") {
    const roots = [env["ProgramFiles(x86)"], env.ProgramFiles, env.LOCALAPPDATA].filter(Boolean);
    return roots.flatMap((r) => [join(r, "Microsoft", "Edge", "Application", "msedge.exe"), join(r, "Google", "Chrome", "Application", "chrome.exe")]);
  }
  if (platform === "darwin")
    return ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"];
  return ["/usr/bin/microsoft-edge", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"];
}

export function appArgs(url) {
  return [`--app=${url}`, "--window-size=1100,760", "--no-first-run", "--no-default-browser-check"];
}

/** Abre a janela. Devolve "janela" (modo aplicativo), "navegador" (padrão) ou null. */
export function openWindow(url, { platform = process.platform, env = process.env, exists = existsSync, run = spawn, fallback = openBrowser } = {}) {
  const exe = appBrowsers(platform, env).find((p) => exists(p));
  if (exe) {
    try {
      run(exe, appArgs(url), { stdio: "ignore", detached: true, windowsHide: true }).on("error", () => fallback(url)).unref();
      return "janela";
    } catch {
      /* tenta o navegador padrão */
    }
  }
  return fallback(url) ? "navegador" : null;
}
