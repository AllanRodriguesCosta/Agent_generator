// Versão 0.11: cofre local das chaves (IA e publicação). Fica na pasta do usuário, FORA do projeto
// (nunca vai para o git nem para o site) e só o próprio usuário lê:
//   Windows  %APPDATA%\agent-generator\cofre.json
//   macOS    ~/Library/Application Support/agent-generator/cofre.json
//   Linux    ~/.config/agent-generator/cofre.json   (AGENTE_COFRE troca o caminho; usado nos testes)
// É o mesmo jeito do gh, do wrangler e do npm guardarem tokens. "Esquecer" apaga do arquivo.
import { mkdir, readFile, writeFile, rename, chmod, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { maskKey } from "./provedores.js";

export function cofreFile(env = process.env, platform = process.platform) {
  if (env.AGENTE_COFRE) return env.AGENTE_COFRE;
  const base =
    platform === "win32"
      ? env.APPDATA || join(homedir(), "AppData", "Roaming")
      : platform === "darwin"
        ? join(homedir(), "Library", "Application Support")
        : env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "agent-generator", "cofre.json");
}

export async function readVault(file = cofreFile()) {
  try {
    const data = JSON.parse(await readFile(file, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

export async function writeVault(data, file = cofreFile()) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify({ ...data, versao: 1, atualizadoEm: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, file);
  await chmod(file, 0o600).catch(() => {});
  return file;
}

/** Lê, aplica fn(atual) e grava. fn pode mudar o objeto ou devolver um novo. */
export async function updateVault(fn, file = cofreFile()) {
  const atual = await readVault(file);
  const novo = (await fn(atual)) || atual;
  await writeVault(novo, file);
  return novo;
}

/** qual: "ia", "cloudflare" ou "tudo". */
export async function forget(qual, file = cofreFile()) {
  if (qual === "tudo") return rm(file, { force: true }).then(() => ({}));
  return updateVault((c) => {
    delete c[qual];
    return c;
  }, file);
}

// O que a janela e o terminal podem mostrar: nada de segredo, só o começo/fim das chaves.
export function vaultView(c = {}) {
  return {
    ia: c.ia?.provedor ? { provedor: c.ia.provedor, modelo: c.ia.modelo || "", baseUrl: c.ia.baseUrl || "", gratis: Boolean(c.ia.gratis), chave: maskKey(c.ia.chave), conectadoEm: c.ia.conectadoEm || "" } : null,
    cloudflare: c.cloudflare?.token ? { conta: c.cloudflare.conta || "", contaId: c.cloudflare.contaId || "", subdominio: c.cloudflare.subdominio || "", token: maskKey(c.cloudflare.token) } : null,
    servicos: Object.fromEntries(Object.entries(c.servicos || {}).map(([k, s]) => [k, { nome: s.nome, url: s.url, modo: s.modo, publicadoEm: s.publicadoEm, ia: s.ia || "nenhuma" }])),
  };
}
