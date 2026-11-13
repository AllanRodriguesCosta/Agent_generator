import { mkdtemp, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const EXAMPLE = join(ROOT, "examples", "loja-exemplo");

// Cópia do projeto de exemplo numa pasta temporária (os testes nunca mexem no original).
export async function exampleCopy(t) {
  const dir = await mkdtemp(join(tmpdir(), "agent-generator-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const site = join(dir, "site");
  await cp(EXAMPLE, site, { recursive: true, filter: (src) => !/[\\/](agente|agente-gerador)([\\/]|$)/.test(src.slice(EXAMPLE.length)) });
  return site;
}
