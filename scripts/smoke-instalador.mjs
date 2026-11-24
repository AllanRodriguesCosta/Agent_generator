// Teste de fumaça do instalador visual (usado no CI com o executável de verdade).
// Uso: node scripts/smoke-instalador.mjs <arquivo-com-a-saida-do-instalador>
// Lê o endereço que o instalador mostrou, faz o raio X, instala com o catálogo desligado, conversa
// com o agente e fecha o instalador pelo botão "Fechar".
import { readFile } from "node:fs/promises";

const saida = process.argv[2];
let url = null;
for (let i = 0; i < 60 && !url; i++) {
  url = (await readFile(saida, "utf8").catch(() => "")).match(/http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]+/)?.[0] || null;
  if (!url) await new Promise((r) => setTimeout(r, 1000));
}
if (!url) throw new Error("O instalador não mostrou o endereço.");
const { origin, searchParams } = new URL(url);
const headers = { "content-type": "application/json", "x-instalador": searchParams.get("t") };
const call = async (method, path, data) => {
  const res = await fetch(origin + path, { method, headers, body: method === "POST" ? JSON.stringify(data || {}) : undefined });
  const j = await res.json();
  if (!res.ok) throw new Error(`${path}: ${j.erro}`);
  return j;
};
const wait = async () => {
  for (let i = 0; i < 120; i++) {
    const { tarefa } = await call("GET", "/api/tarefa");
    if (tarefa.status === "ok") return tarefa.resultado;
    if (tarefa.status === "erro") throw new Error(tarefa.erro);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Tarefa não terminou.");
};

const page = await fetch(url).then((r) => r.text());
if (!page.includes("/app.js")) throw new Error("Página do instalador não veio.");
const estado = await call("GET", "/api/estado");
if (!estado.info) throw new Error("A pasta do executável não foi aberta.");
await call("POST", "/api/analisar");
const analise = await wait();
console.log(`Raio X: ${analise.resumo.paginas} páginas; recursos: ${analise.recursos.map((r) => `${r.id}=${r.disponivel ? "sim" : "não"}`).join(", ")}`);
await call("POST", "/api/instalar", { recursos: { catalogo: false }, agente: { nome: "Assistente CI", cor: "#0f766e" }, inserir: true });
const inst = await wait();
console.log(`Instalado em ${inst.dir}; acerto ${inst.geral}%; widget em ${inst.inseridas.join(", ")}`);
const r = await call("POST", "/api/testar", { mensagem: "qual o horario de funcionamento?" });
console.log(`Agente: ${r.texto}`);
await call("POST", "/api/sair");
console.log("Instalador fechado.");
