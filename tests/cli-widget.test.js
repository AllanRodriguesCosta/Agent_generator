import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { once } from "node:events";
import { ROOT, exampleCopy } from "./helpers.js";
import { parseArgs, staticServer } from "../bin/agent-generator.js";

const cli = (...args) => spawnSync(process.execPath, [join(ROOT, "bin", "agent-generator.js"), ...args], { encoding: "utf8" });

test("CLI criar: raio X, base, instalação, avaliação e saída JSON para IAs", async (t) => {
  const site = await exampleCopy(t);
  const r = cli("criar", site, "--inserir", "--json");
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.relatorio.faq, 5);
  assert.equal(out.publicPath, "/agente/");
  assert.ok(out.geral >= 95);
  assert.equal(out.inserido.changed.length, 5);
  const config = JSON.parse(await readFile(join(site, "agente-gerador", "config.json"), "utf8"));
  assert.deepEqual(config, { destino: "agente", publicPath: "/agente/" });
  for (const f of ["relatorio.json", "PROMPT-IA.md", "avaliacao.txt"]) assert.ok((await readFile(join(site, "agente-gerador", f), "utf8")).length > 10, f);

  const chat = cli("conversar", site, "oi", "quero um café até 50 reais", "--json");
  assert.equal(chat.status, 0, chat.stderr);
  const replies = JSON.parse(chat.stdout);
  assert.deepEqual(replies.map((x) => x.intencao), ["saudacao", "catalogo"]);

  // aplicar-ia guarda backup e junta a sugestão.
  const answer = join(site, "resposta.json");
  await writeFile(answer, JSON.stringify({ faq: [{ pergunta: "Tem descafeinado?", resposta: "Ainda não." }] }));
  const ai = cli("aplicar-ia", site, answer, "--json");
  assert.equal(ai.status, 0, ai.stderr);
  assert.equal(JSON.parse(ai.stdout).changes.faqNovas, 1);
  assert.match(JSON.parse(ai.stdout).backup, /agente-gerador[\\/]backup[\\/]conhecimento-/);

  const again = cli("gerar", site, "--json");
  assert.equal(JSON.parse(again.stdout).mantidos.length, 7, "gerar de novo não apaga a base editada");
});

test("CLI: ajuda, comando desconhecido e pasta inexistente", () => {
  assert.match(cli("ajuda").stdout, /Comandos:/);
  assert.match(cli("voar", ".").stderr, /Comando desconhecido/);
  const missing = cli("criar", join(ROOT, "nao-existe"));
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Pasta não encontrada/);
  assert.deepEqual(parseArgs(["criar", "x", "--destino", "public/a", "--json", "--porta=8080"]), { _: ["criar", "x"], flags: { destino: "public/a", json: true, porta: "8080" } });
});

test("servidor estático: serve arquivos e não sai da pasta", async (t) => {
  const site = await exampleCopy(t);
  const server = staticServer(site).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type"), /text\/html/);
  assert.equal((await fetch(`${base}/..%2f..%2fetc/passwd`)).status, 404);
  assert.equal((await fetch(`${base}/nao-existe.html`)).status, 404);
});

test("widget: links seguros e lista dentro da resposta da API (módulo instalado, fora do navegador)", async (t) => {
  const site = await exampleCopy(t);
  assert.equal(cli("instalar", site).status, 0);
  const w = await import(pathToFileURL(join(site, "agente", "widget.js")).href);
  assert.equal(w.safeHref("javascript:alert(1)", "https://a.com"), "#");
  assert.equal(w.safeHref("/x", "https://a.com"), "https://a.com/x");
  assert.deepEqual(w.listFrom({ data: [{ a: 1 }] }), [{ a: 1 }]);
  assert.deepEqual(w.listFrom({ total: 1, resultados: [{ b: 2 }] }), [{ b: 2 }]);
  const files = {
    "agente.json": { site: "API" },
    "catalogo.json": { url: "/api/produtos", linkModelo: "/produto?id={id}" },
  };
  const raw = await w.loadKnowledge(new URL("https://loja.test/agente/"), async (url) => {
    const name = String(url).split("/").pop();
    if (String(url).endsWith("/api/produtos")) return { ok: true, json: async () => ({ data: [{ id: "g1", name: "Guitarra", price: 1000 }] }) };
    return files[name] ? { ok: true, json: async () => files[name] } : { ok: false };
  });
  assert.deepEqual(raw.catalogo.itens.map((i) => i.nome), ["Guitarra"]);
  const { createAgent } = await import(pathToFileURL(join(site, "agente", "nucleo", "agent.js")).href);
  assert.equal(createAgent(raw).reply("tem guitarra?").itens[0].link, "/produto?id=g1");
});
