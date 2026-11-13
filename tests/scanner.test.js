import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { scanProject } from "../src/scanner/index.js";
import { parseMarkup } from "../src/scanner/html.js";
import { parseMarkdown } from "../src/scanner/docs.js";
import { routesFromSource, routeFromFile } from "../src/scanner/routes.js";
import { catalogFromJson, catalogFromCsv } from "../src/scanner/data.js";
import { contactsFrom } from "../src/scanner/contacts.js";
import { EXAMPLE } from "./helpers.js";

async function project(t, files) {
  const dir = await mkdtemp(join(tmpdir(), "ag-scan-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, file)), { recursive: true });
    await writeFile(join(dir, file), content);
  }
  return dir;
}

test("raio X do exemplo: projeto, páginas, rotas, formulário, FAQ, catálogo e contatos", async () => {
  const r = await scanProject(EXAMPLE);
  assert.equal(r.projeto.site, "Café Aurora");
  assert.deepEqual(r.projeto.stack, ["Express"]);
  assert.equal(r.projeto.idioma, "pt-BR");
  assert.deepEqual(r.paginas.map((p) => p.href).sort(), ["/", "/cardapio.html", "/contato.html", "/entrega.html", "/sobre.html"]);
  assert.deepEqual(r.rotas.map((x) => `${x.metodo} ${x.caminho}`), ["GET /api/produtos", "POST /api/contato", "POST /api/pedidos"]);
  assert.equal(r.formularios[0].botao, "Enviar mensagem");
  assert.equal(r.faq.length, 5);
  assert.ok(r.faq.some((f) => f.pergunta === "O café vem moído?"), "P:/R: também vira pergunta");
  assert.ok(!r.faq.find((f) => f.pergunta === "Como funciona a assinatura?").resposta.includes("P:"));
  assert.equal(r.catalogo.fonte, "data/produtos.json");
  assert.equal(r.catalogo.total, 7);
  assert.deepEqual(r.contatos.emails, ["contato@cafeaurora.example"]);
  assert.deepEqual(r.contatos.whatsapp, ["https://wa.me/5541999990000"]);
  assert.deepEqual(r.contatos.horario, ["Seg a sáb, 8h às 19h"]);
  assert.deepEqual(r.avisos, []);
});

test("raio X não lê segredos, dependências nem a pasta do próprio agente", async (t) => {
  const dir = await project(t, {
    "index.html": "<title>Loja</title><h1>Oi</h1>",
    ".env": "DATABASE_URL=postgres://u:senha@x/db",
    "config/credentials.json": '[{"name":"a"},{"name":"b"}]',
    "node_modules/x/index.html": "<title>Não</title>",
    "agente/conhecimento/faq.json": "[]",
    "chave.pem": "-----BEGIN-----",
  });
  const r = await scanProject(dir);
  assert.deepEqual(r.paginas.map((p) => p.href), ["/"]);
  assert.equal(r.resumo.ignorados.segredos, 3);
  assert.equal(r.catalogo, null);
  assert.ok(!JSON.stringify(r).includes("senha"));
  assert.ok(r.avisos.some((a) => /segredo/.test(a)));
});

test("frameworks: Next.js (app e pages), SvelteKit, React Router, Flask, Laravel, Express", async (t) => {
  assert.equal(routeFromFile("app/produtos/[id]/page.tsx"), "/produtos/:id");
  assert.equal(routeFromFile("src/app/(loja)/sobre/page.jsx"), "/sobre");
  assert.equal(routeFromFile("pages/index.tsx"), "/");
  assert.equal(routeFromFile("pages/contato.jsx"), "/contato");
  assert.equal(routeFromFile("pages/_app.tsx"), null);
  assert.equal(routeFromFile("src/routes/blog/+page.svelte"), "/blog");
  const react = routesFromSource(`import { Route } from "react-router-dom"; <Route path="/carrinho" element={<C/>} />`, "src/App.jsx");
  assert.deepEqual(react.map((r) => [r.caminho, r.tipo]), [["/carrinho", "pagina"]]);
  assert.deepEqual(routesFromSource(`@app.route("/cursos")\ndef c(): pass`, "app.py").map((r) => r.caminho), ["/cursos"]);
  assert.deepEqual(routesFromSource(`Route::get('/planos', fn() => 1);`, "routes/web.php").map((r) => r.caminho), ["/planos"]);
  assert.deepEqual(routesFromSource(`router.post("/api/login", h)`, "api.js").map((r) => [r.metodo, r.tipo]), [["POST", "api"]]);
  const dir = await project(t, {
    "package.json": '{"name":"minha-loja","dependencies":{"next":"15","react":"19"}}',
    "app/page.tsx": "export default () => <main><h1>Minha Loja</h1><a href=\"/planos\">Planos</a></main>",
    "app/planos/page.tsx": "export default () => <h1>Planos e preços</h1>",
  });
  const r = await scanProject(dir);
  assert.deepEqual(r.projeto.stack, ["Next.js", "React"]);
  assert.deepEqual(r.paginas.map((p) => p.href).sort(), ["/", "/planos"]);
  assert.equal(r.paginas.find((p) => p.href === "/planos").titulo, "Planos e preços");
});

test("HTML: título, descrição, títulos, links, formulários sem senha e entidades", () => {
  const p = parseMarkup(`<html lang="pt-BR"><title>A &amp; B</title><meta name="description" content="Desc"><script>var x="<h1>não</h1>"</script>
    <h1>Bem-vindo</h1><a href="/x">Ir &agrave; X</a><a href="javascript:alert(1)">mal</a>
    <form action="/entrar"><label>E-mail</label><input name="email"><input type="password" name="senha"><button>Entrar</button></form></html>`);
  assert.equal(p.titulo, "A & B");
  assert.equal(p.descricao, "Desc");
  assert.equal(p.lang, "pt-BR");
  assert.deepEqual(p.headings.map((h) => h.texto), ["Bem-vindo"]);
  assert.deepEqual(p.links.map((l) => l.href), ["/x"]);
  assert.deepEqual(p.forms[0].campos, ["E-mail", "email"]);
  assert.equal(p.forms[0].botao, "Entrar");
});

test("Markdown: perguntas em títulos e em P:/R:, ignorando código", () => {
  const d = parseMarkdown("# Projeto\n\n## Tem garantia?\nSim, 1 ano.\n\n```\n## Não é título?\n```\n\nQ: Aceita pix?\nA: Aceita.\n");
  assert.equal(d.titulo, "Projeto");
  assert.deepEqual(d.faq, [{ pergunta: "Tem garantia?", resposta: "Sim, 1 ano." }, { pergunta: "Aceita pix?", resposta: "Aceita." }]);
});

test("catálogo: JSON aninhado, preço em centavos, marca + modelo e CSV com ponto e vírgula", () => {
  const [c] = catalogFromJson(JSON.stringify({ data: { produtos: [{ marca: "Fender", modelo: "Strato", priceCents: 459900, categoria: "Guitarras" }, { marca: "Vox", modelo: "AC15", priceCents: 899900 }] } }), "seed.json");
  assert.equal(c.fonte, "seed.json (data.produtos)");
  assert.deepEqual(c.itens.map((i) => [i.nome, i.preco]), [["Fender Strato", 4599], ["Vox AC15", 8999]]);
  const [csv] = catalogFromCsv("nome;preço;categoria\nAula de violão;R$ 120,00;Aulas\nAula de canto;1.150,50;Aulas\n", "cursos.csv");
  assert.deepEqual(csv.itens.map((i) => i.preco), [120, 1150.5]);
  assert.deepEqual(catalogFromJson("[1,2,3]", "x.json"), []);
});

test("contatos: ignora e-mail de exemplo genérico; horário só com dias e horas", () => {
  const c = contactsFrom(["Fale: vendas@loja.com.br, teste@example.com. Seg a sex, das 9h às 18h. (11) 98888-7777", "https://instagram.com/loja"]);
  assert.deepEqual(c.emails, ["vendas@loja.com.br"]);
  assert.deepEqual(c.telefones, ["(11) 98888-7777"]);
  assert.deepEqual(c.redes, ["https://instagram.com/loja"]);
  assert.equal(c.horario.length, 1);
  assert.deepEqual(contactsFrom(["entregamos na sexta às 12h"]).horario, []);
});
