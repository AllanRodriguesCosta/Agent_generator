// Versão 0.3: observação (proxy + gravador), aprendizado, consultas da conta, busca do site,
// conversa em etapas, treino e executável em duas partes.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { exampleCopy } from "./helpers.js";
import { createObserver, injectHtml, localTarget } from "../src/observe/proxy.js";
import { templatePath, sanitize } from "../src/observe/record.js";
import { summarize, applyObservation, formFaq } from "../src/observe/learn.js";
import { urlFromOutput } from "../src/observe/session.js";
import { createAgent } from "../src/agent/agent.js";
import { describeLookup } from "../src/agent/lookup.js";
import { applyCorrection, trainingBase } from "../src/train/apply.js";
import { main } from "../bin/agent-generator.js";

const { resolveArgs, defaultCommand } = createRequire(import.meta.url)("../sea/launcher.cjs");

// Site "de verdade" rodando na máquina: páginas, API pública, API da conta e uma ação.
async function fakeSite(t) {
  const html = (title, body) => `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>`;
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const logged = /sessao=ok/.test(req.headers.cookie || "");
    const json = (status, data) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (!url.pathname.startsWith("/api") && url.pathname !== "/redir") res.setHeader("content-type", "text/html; charset=utf-8");
    if (url.pathname === "/") return res.end(html("Loja Teste", '<a href="/produto?id=p1">Ver</a>'));
    if (url.pathname === "/busca") return res.end(html("Busca", "resultados"));
    if (url.pathname === "/produto") return res.end(html("Produto", "detalhes"));
    if (url.pathname === "/entrar") return res.end(html("Entrar", '<form method="post"><input name="email"><input type="password" name="senha"></form>'));
    if (url.pathname === "/api/products") return json(200, { data: [{ id: "p1", nome: "Caneca Azul", preco: 39.9, categoria: "Cozinha" }, { id: "p2", nome: "Caneca Verde", preco: 42, categoria: "Cozinha" }] });
    if (url.pathname === "/api/orders") return logged ? json(200, { data: [{ id: "a1b2c3d4e5", status: "Enviado", createdAt: "2026-11-10T10:00:00Z", totalCents: 8190, email: "ana@x.com" }, { id: "f6", status: "Concluído", createdAt: "2026-10-01T10:00:00Z", totalCents: 4000 }] }) : json(401, { erro: "login" });
    if (url.pathname === "/api/cart" && req.method === "POST") return json(201, { ok: true });
    if (url.pathname === "/redir") {
      res.writeHead(302, { location: `http://localhost:${server.address().port}/busca` });
      return res.end();
    }
    res.writeHead(404);
    res.end("nada");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  return `http://localhost:${server.address().port}/`;
}

test("partes puras: caminho com :id, dados sensíveis ocultos, injeção, só destino local", () => {
  assert.equal(templatePath("/api/orders/123/itens/8f1c2a9e-1111-2222-3333-444455556666"), "/api/orders/:id/itens/:id");
  assert.deepEqual(sanitize({ nome: "Caneca", email: "ana@x.com", senha: "123", obs: "ligar 41 99999-0000", lista: [{ cpf: "1" }] }), { nome: "Caneca", email: "[oculto]", senha: "[oculto]", obs: "[oculto]", lista: [{ cpf: "[oculto]" }] });
  assert.equal(injectHtml("<html><head></head><body>x</body></html>", { head: "<H>", body: "<B>" }), "<html><head><H></head><body>x<B></body></html>");
  assert.throws(() => localTarget("https://site-de-alguem.com"), /na sua máquina/);
  assert.equal(urlFromOutput("\x1b[32m  ➜  Local:   http://localhost:5174/\x1b[0m"), "http://localhost:5174/");
});

test("proxy injeta o gravador, repassa tudo e anota as chamadas sem cookie nem dado pessoal", async (t) => {
  const up = await fakeSite(t);
  let ended = "";
  const obs = createObserver({ target: up, inject: { body: '<script src="/__agente-gerador/gravador.js"></script>' }, onEnd: (m) => (ended = m) });
  obs.server.listen(0, "127.0.0.1");
  await once(obs.server, "listening");
  t.after(() => obs.server.close());
  const base = `http://127.0.0.1:${obs.server.address().port}`;
  const page = await (await fetch(`${base}/`)).text();
  assert.match(page, /<script src="\/__agente-gerador\/gravador\.js"><\/script><\/body>/);
  assert.match(await (await fetch(`${base}/__agente-gerador/gravador.js`)).text(), /observando o site/);
  assert.match(await (await fetch(`${base}/__agente-gerador/treino.js`)).text(), /AGENTE_TREINO/);
  const redirect = await fetch(`${base}/redir`, { redirect: "manual" });
  assert.equal(redirect.headers.get("location"), "/busca", "redirecionamento continua no proxy");
  assert.equal((await fetch(`${base}/api/orders`)).status, 401);
  const orders = await (await fetch(`${base}/api/orders`, { headers: { cookie: "sessao=ok" } })).json();
  assert.equal(orders.data.length, 2, "resposta chega inteira ao navegador");
  await fetch(`${base}/api/cart`, { method: "POST", headers: { "content-type": "application/json", cookie: "sessao=ok" }, body: JSON.stringify({ productId: "p1", senha: "x" }) });
  const seen = obs.exchanges.find((x) => x.caminho === "/api/orders" && x.status === 200);
  assert.ok(seen.comSessao);
  assert.equal(seen.resposta.data[0].email, "[oculto]");
  assert.ok(!JSON.stringify(obs.exchanges).includes("sessao=ok"), "cookie nunca é guardado");
  assert.deepEqual(obs.exchanges.find((x) => x.metodo === "POST").camposEnviados, ["productId", "senha (sensível)"]);
  await fetch(`${base}/__agente-gerador/evento`, { method: "POST", body: JSON.stringify({ tipo: "pagina", url: "/busca?q=caneca", titulo: "Busca" }) });
  assert.equal(obs.events.length, 1);
  await fetch(`${base}/__agente-gerador/fim`, { method: "POST" });
  assert.equal(ended, "botao");
});

test("aprendizado: páginas, formulário vira pergunta, busca, login, consulta da conta e catálogo da API", () => {
  const obs = summarize({
    events: [
      { tipo: "pagina", url: "/", titulo: "Loja Teste", h1: "Loja Teste", cabecalhos: ["Destaques"] },
      { tipo: "pagina", url: "/busca?q=caneca", titulo: "Busca", h1: "Resultados da busca" },
      { tipo: "pagina", url: "/produto?id=p1", titulo: "Produto", h1: "Caneca Azul" },
      { tipo: "pagina", url: "/minha-conta/pedidos", titulo: "Meus pedidos", h1: "Meus pedidos" },
      { tipo: "pagina", url: "/entrar", titulo: "Entrar", h1: "Entrar" },
      { tipo: "formulario", pagina: "/contato", titulo: "Fale conosco", botao: "Enviar mensagem", metodo: "post", campos: [{ rotulo: "Nome", tipo: "text", obrigatorio: true }, { rotulo: "Mensagem", tipo: "textarea", obrigatorio: true }] },
    ],
    exchanges: [
      { metodo: "GET", caminho: "/api/products", original: "/api/products", query: [], status: 200, comSessao: false, camposEnviados: [], resposta: { data: [{ id: "p1", nome: "Caneca Azul", preco: 39.9 }, { id: "p2", nome: "Caneca Verde", preco: 42 }] } },
      { metodo: "GET", caminho: "/api/orders", original: "/api/orders", query: [], status: 200, comSessao: true, camposEnviados: [], resposta: { data: [{ id: "a1", status: "Enviado", createdAt: "2026-11-10" }] } },
      { metodo: "POST", caminho: "/api/cart", original: "/api/cart", query: [], status: 201, comSessao: true, camposEnviados: ["productId"] },
    ],
  });
  assert.equal(obs.login, "/entrar");
  assert.equal(obs.buscas[0].modelo, "/busca?q={termo}");
  assert.deepEqual(obs.acoes.map((a) => `${a.metodo} ${a.caminho}`), ["POST /api/cart"]);
  const base = { agente: { site: "Loja" }, intencoes: {}, faq: [], paginas: [{ titulo: "Início", href: "/" }], catalogo: { rotulo: "produtos", itens: [] } };
  const { knowledge, changes } = applyObservation(base, obs);
  assert.ok(changes.paginas.includes("/minha-conta/pedidos") && !changes.paginas.includes("/"));
  assert.equal(knowledge.faq[0].pergunta, "Como faço para enviar mensagem?");
  assert.match(knowledge.faq[0].resposta, /preencha nome e mensagem e toque em “Enviar mensagem”/);
  assert.equal(knowledge.consultas.buscas[0].modelo, "/busca?q={termo}");
  assert.equal(knowledge.consultas.dados[0].rotulo, "pedidos");
  assert.equal(knowledge.consultas.dados[0].url, "/api/orders");
  assert.equal(knowledge.catalogo.url, "/api/products");
  assert.equal(knowledge.catalogo.linkModelo, "/produto?id={id}", "link de cada item descoberto pela visita");
  assert.equal(formFaq({ botao: "OK", titulo: "Newsletter", campos: [{ rotulo: "E-mail", tipo: "email" }], pagina: "/" }, "Início").pergunta, "Como faço para preencher “Newsletter”?");
});

test("agente: consulta da conta, busca do site e conversa em etapas (com encadeamento)", () => {
  const agent = createAgent({
    agente: { site: "Loja" },
    intencoes: { saudacao: { exemplos: ["oi", "olá", "bom dia"], respostas: ["Oi!"] } },
    consultas: { login: "/entrar", buscas: [{ id: "busca", modelo: "/busca?q={termo}" }], dados: [{ id: "pedidos", rotulo: "pedidos", url: "/api/orders", exemplos: ["onde está meu pedido", "status do meu pedido", "meu pedido já foi enviado?", "ver meus pedidos"], pagina: "/conta" }] },
    fluxos: [
      { id: "entrega", gatilhos: ["como funciona a entrega", "vocês entregam?", "qual o prazo de entrega"], pergunta: "Você prefere entrega ou retirada?", opcoes: [{ rotulo: "Entrega", resposta: "Entregamos em 2 dias úteis.", proximo: "regiao" }, { rotulo: "Retirada na loja", resposta: "Retire na loja em 1 hora." }] },
      { id: "regiao", gatilhos: ["entregam na minha região", "qual região vocês atendem"], pergunta: "Qual região?", opcoes: [{ rotulo: "Capital", resposta: "Na capital é grátis." }, { rotulo: "Interior", resposta: "No interior custa R$ 20." }] },
    ],
  });
  const lookup = agent.reply("onde está meu pedido?");
  assert.equal(lookup.intencao, "consulta__pedidos");
  assert.equal(lookup.consulta.url, "/api/orders");
  assert.equal(lookup.consulta.login, "/entrar");
  const search = agent.reply("procurar caneca azul");
  assert.equal(search.acoes[0].href, "/busca?q=caneca%20azul");
  let r = agent.reply("como funciona a entrega?");
  assert.equal(r.texto, "Você prefere entrega ou retirada?");
  assert.deepEqual(r.sugestoes, ["Entrega", "Retirada na loja"]);
  const pick = agent.reply("retirada", r.contexto);
  assert.equal(pick.texto, "Retire na loja em 1 hora.");
  r = agent.reply("a primeira", r.contexto);
  assert.equal(r.texto, "Entregamos em 2 dias úteis. Qual região?", "opção com próximo passo encadeia");
  assert.equal(agent.reply("Interior", r.contexto).texto, "No interior custa R$ 20.");
});

test("resumo da consulta: login, vazio, mais recente e em andamento", () => {
  const cfg = { rotulo: "pedidos", pagina: "/conta", login: "/entrar" };
  assert.deepEqual(describeLookup(cfg, { status: 401 }).acoes, [{ rotulo: "Entrar", href: "/entrar" }]);
  assert.match(describeLookup(cfg, { status: 200, dados: { data: [] } }).texto, /Não encontrei pedidos/);
  const out = describeLookup(cfg, { status: 200, dados: { data: [{ id: "old", status: "Recebido", createdAt: "2026-10-01" }, { id: "a1b2c3d4e5", status: "Enviado", createdAt: "2026-11-10T10:00:00Z", totalCents: 8190 }, { id: "x", status: "Concluído", createdAt: "2026-09-01" }] } });
  assert.match(out.texto, /^Pedido mais recente \(#A1B2C3D4\), de 10\/11\/2026, R\$\s?81,90: “Enviado”\. Você tem 3 pedidos no total, 1 ainda em andamento\.$/);
});

test("treino: frase nova numa intenção, na FAQ, resposta nova, edição e conversa em etapas", () => {
  const base = { intencoes: { contato: { exemplos: ["falar com alguém", "quero atendimento"], respostas: ["Chame no WhatsApp."] } }, faq: [{ pergunta: "Qual o prazo de entrega?", resposta: "3 dias.", termos: "" }], fluxos: [] };
  let k = applyCorrection(base, { pergunta: "cadê o suporte?", tipo: "intencao", alvo: "contato" }).knowledge;
  assert.ok(k.intencoes.contato.exemplos.includes("cadê o suporte?"));
  k = applyCorrection(k, { pergunta: "demora quanto pra chegar", tipo: "faq", alvo: "qual-o-prazo-de-entrega" }).knowledge;
  assert.match(k.faq[0].termos, /demora/);
  k = applyCorrection(k, { pergunta: "Qual o prazo de entrega?", tipo: "editar", alvo: "qual-o-prazo-de-entrega", resposta: "2 dias úteis." }).knowledge;
  assert.equal(k.faq[0].resposta, "2 dias úteis.");
  k = applyCorrection(k, { pergunta: "Vocês abrem domingo?", tipo: "nova", resposta: "Não, só de segunda a sábado." }).knowledge;
  assert.equal(k.faq.length, 2);
  assert.throws(() => applyCorrection(k, { pergunta: "vocês abrem domingo?", tipo: "nova", resposta: "x y" }), /já está na FAQ/);
  k = applyCorrection(k, { pergunta: "quero um bolo", tipo: "fluxo", etapa: "Para quantas pessoas?", opcoes: [{ rotulo: "Até 10", resposta: "O bolo P serve 10." }, { rotulo: "Mais de 10", resposta: "O bolo G serve 25." }, { rotulo: "", resposta: "" }] }).knowledge;
  const agent = createAgent(k);
  assert.equal(agent.knowledge.fluxos.length, 1, "conversa criada passa na conferência da base");
  const r = agent.reply("quero um bolo");
  assert.equal(r.texto, "Para quantas pessoas?");
  assert.equal(agent.reply("mais de 10", r.contexto).texto, "O bolo G serve 25.");
  assert.deepEqual(trainingBase(agent.knowledge).fluxos.map((f) => f.pergunta), ["Para quantas pessoas?"]);
});

test("executável em duas partes: com “treinador” no nome abre o treino", () => {
  const isDir = () => true;
  assert.equal(defaultCommand("C:\\Users\\a\\agente-treinador-windows.exe"), "treinar");
  assert.equal(defaultCommand("/x/agente-gerador-linux"), "assistente");
  assert.deepEqual(resolveArgs([], "/site", isDir, "/site/agente-treinador-linux"), ["treinar", "/site"]);
  assert.deepEqual(resolveArgs(["--minutos", "2", "--sem-pausa"], "/site", isDir, "agente-treinador-macos"), ["treinar", "/site", "--minutos", "2", "--sem-pausa"]);
});

test("comando observar de ponta a ponta: sessão encerrada pelo botão, base atualizada com backup", async (t) => {
  const site = await exampleCopy(t);
  const up = await fakeSite(t);
  const run = main(["observar", site, "--url", up, "--sem-navegador", "--minutos", "2", "--sem-pausa"]);
  let base;
  for (let i = 0; i < 100 && !base; i++) {
    for (let p = 4700; p <= 4710 && !base; p++) {
      const ok = await fetch(`http://127.0.0.1:${p}/__agente-gerador/gravador.js`).then((r) => r.ok, () => false);
      if (ok) base = `http://127.0.0.1:${p}`;
    }
    if (!base) await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(base, "proxy subiu");
  await fetch(`${base}/api/orders`, { headers: { cookie: "sessao=ok" } });
  await fetch(`${base}/__agente-gerador/evento`, { method: "POST", body: JSON.stringify({ tipo: "pagina", url: "/busca?q=caneca", titulo: "Busca", h1: "Resultados" }) });
  await fetch(`${base}/__agente-gerador/fim`, { method: "POST" });
  assert.equal(await run, 0);
  const consultas = JSON.parse(await readFile(join(site, "agente", "conhecimento", "consultas.json"), "utf8"));
  assert.equal(consultas.buscas[0].modelo, "/busca?q={termo}");
  assert.equal(consultas.dados[0].url, "/api/orders");
  const text = await readFile(join(site, "agente-gerador", "OBSERVACAO.txt"), "utf8");
  assert.match(text, /Consulta da conta: pedidos \(\/api\/orders\)/);
  const config = JSON.parse(await readFile(join(site, "agente-gerador", "config.json"), "utf8"));
  assert.equal(config.url, up);
});
