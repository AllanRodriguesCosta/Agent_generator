// Demonstração: copia o site de exemplo para .demo/ (fora do git), cria o agente nele e,
// com --servir, abre em http://localhost:5173. O exemplo original não é alterado.
import { cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { main } from "../bin/agent-generator.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const demo = join(root, ".demo", "cafe-aurora");
await rm(join(root, ".demo"), { recursive: true, force: true });
await cp(join(root, "examples", "loja-exemplo"), demo, { recursive: true });
await main(["criar", demo, "--inserir"]);
if (process.argv.includes("--servir")) await main(["servir", demo]);
else console.log(`\nPara ver no navegador: npm run demo:servir`);
