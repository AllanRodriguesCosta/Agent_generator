// Reporter do node:test para o CI: cada teste que falha vira uma anotação do GitHub (::error),
// visível no resumo do PR e pela API, sem precisar abrir o log. Fica junto do reporter normal:
//   node --test --test-reporter=spec --test-reporter-destination=stdout \
//               --test-reporter=./scripts/anotar-falhas.mjs --test-reporter-destination=stdout
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

const MAX = 20; // o GitHub mostra até 10 erros por passo; o resto fica no log normal
const texto = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const campo = (s) => texto(s).replace(/:/g, "%3A").replace(/,/g, "%2C");

export default async function* anotarFalhas(source) {
  let n = 0;
  for await (const { type, data } of source) {
    if (type !== "test:fail" || n >= MAX) continue;
    const erro = data.details?.error;
    if (erro?.failureType === "subtestsFailed") continue; // o subteste que falhou já foi anotado
    const causa = erro?.cause ?? erro;
    const mensagem = String(causa?.message ?? causa ?? "falhou").slice(0, 1500);
    const pilha = String(causa?.stack ?? "").split("\n").filter((l) => /^\s+at /.test(l)).slice(0, 4).join("\n");
    let arquivo = data.file || "";
    if (arquivo.startsWith("file:")) arquivo = fileURLToPath(arquivo);
    if (arquivo) arquivo = relative(process.cwd(), arquivo).split("\\").join("/");
    const onde = arquivo ? `file=${campo(arquivo)},${data.line ? `line=${data.line},` : ""}` : "";
    n++;
    yield `::error ${onde}title=${campo(`Teste falhou: ${data.name}`)}::${texto(`${mensagem}\n${pilha}`.trim())}\n`;
  }
}
