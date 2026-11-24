import test from "node:test";
import assert from "node:assert/strict";
import { scanProject } from "../src/scanner/index.js";
import { generateKnowledge, cleanTitle } from "../src/generator/index.js";
import { createAgent, extractPrice, money } from "../src/agent/agent.js";
import { checkKnowledge, safeLink } from "../src/agent/knowledge.js";
import { candidatesFromReport, classifyInteraction } from "../src/capabilities/glossary.js";
import { evaluateKnowledge } from "../src/eval/index.js";
import { EXAMPLE } from "./helpers.js";

const { knowledge } = generateKnowledge(await scanProject(EXAMPLE));
const agent = createAgent(knowledge);
const ask = (q, ctx) => agent.reply(q, ctx);

test("gerador: nome do site, títulos limpos, intenções básicas e nada inventado", () => {
  assert.equal(knowledge.agente.site, "Café Aurora");
  assert.equal(cleanTitle("Cardápio | Café Aurora", "Café Aurora"), "Cardápio");
  assert.deepEqual(Object.keys(knowledge.intencoes), ["saudacao", "despedida", "agradecimento", "sobre_bot", "ajuda", "contato", "catalogo_ajuda"]);
  assert.ok(knowledge.paginas.some((p) => p.href === "/assinatura.html"), "destino só linkado também vira página");
  assert.match(knowledge.intencoes.contato.respostas[0], /contato@cafeaurora\.example/);
  assert.deepEqual(knowledge.intencoes.contato.acoes.map((a) => a.href), ["https://wa.me/5541999990000", "/contato.html"]);
  // Só fatos do projeto: a FAQ gerada é a do README + o horário encontrado.
  assert.equal(knowledge.faq.length, 6);
  assert.equal(knowledge.catalogo.itens.length, 7);
  assert.equal(knowledge.acoes.padrao, "negar");
  assert.ok(knowledge.acoes.acoes.some((a) => a.tipo === "navegar" && a.href === "/contato.html"));
  assert.ok(knowledge.acoes.acoes.every((a) => a.tipo === "navegar" && a.href.startsWith("/") && !a.href.startsWith("//")));
  assert.ok(knowledge.acoes.candidatas.some((a) => a.caminho === "/api/pedidos" && a.categoria === "dados_da_conta" && a.estado === "bloqueada"));
});

test("conversa: cumprimento, FAQ com outras palavras, página, contato, catálogo e não entendi", () => {
  assert.equal(ask("oi").intencao, "saudacao");
  assert.equal(ask("vocês entregam no sábado?").fonte, "voces-entregam-aos-sabados");
  assert.equal(ask("como pago?").fonte, "quais-formas-de-pagamento-voces-aceitam");
  assert.equal(ask("posso trocar se nao gostar").fonte, "posso-trocar-o-cafe-se-nao-gostar");
  assert.equal(ask("onde fica o cardápio").acoes[0].href, "/cardapio.html");
  assert.equal(ask("frete gratis").acoes[0].href, "/entrega.html");
  const contact = ask("quero falar com alguém");
  assert.equal(contact.intencao, "contato");
  assert.ok(contact.acoes.some((a) => a.href.startsWith("https://wa.me/")));
  assert.equal(ask("asdfgh qwerty").intencao, "nao_entendi");
  assert.equal(ask("<img src=x onerror=alert(1)>").intencao, "nao_entendi");
  assert.equal(ask("").intencao, "vazio");
});

test("catálogo: assunto + preço máximo, mais opções, nada no orçamento e erro de digitação", () => {
  const cafes = ask("quero um café");
  assert.equal(cafes.intencao, "catalogo");
  // 0.10: a ordem entre itens igualmente relevantes vem do BM25 (o texto mais focado primeiro).
  assert.deepEqual(cafes.itens.map((i) => i.id).sort(), ["cafe-cerrado", "cafe-mantiqueira", "cafe-parana"]);
  const cheap = ask("quero um café até 50 reais");
  assert.deepEqual(cheap.itens.map((i) => [i.id, i.precoTexto.replace(/\s/g, " ")]), [["cafe-cerrado", "R$ 42,90"]]);
  assert.match(ask("tem algo até 20 reais").texto, /Não encontrei produtos até R\$\s20,00\. O mais em conta é Caneca/);
  const all = ask("quero ver produtos até R$ 300");
  assert.equal(all.itens.length, 3);
  assert.deepEqual(all.sugestoes, ["Mais opções", "Compara os dois primeiros", "O mais barato"]);
  const more = ask("mais opções", all.contexto);
  assert.equal(more.itens.length, 3);
  assert.notDeepEqual(more.itens.map((i) => i.id), all.itens.map((i) => i.id));
  assert.equal(ask("mais").intencao, "mais_sem_contexto");
  assert.equal(ask("tem caneca?").itens[0].id, "caneca");
  assert.equal(ask("prensa francsa").itens[0].id, "prensa");
});

test("preço no texto e moeda", () => {
  assert.equal(extractPrice("até R$ 1.500,50"), 1500.5);
  assert.equal(extractPrice("menos de 300"), 300);
  assert.equal(extractPrice("uns 2 mil reais"), 2000);
  assert.equal(extractPrice("no máximo 2k"), 2000);
  assert.equal(extractPrice("tenho 3 filhos"), null);
  assert.match(money(42.9), /R\$\s42,90/);
});

test("base: links perigosos e entradas incompletas são descartados, com aviso", () => {
  assert.equal(safeLink("javascript:alert(1)"), "");
  assert.equal(safeLink("data:text/html,x"), "");
  assert.equal(safeLink("/ok?x=1#y"), "/ok?x=1#y");
  assert.equal(safeLink("https://wa.me/55"), "https://wa.me/55");
  const { knowledge: k, problems } = checkKnowledge({
    agente: { site: "X", cor: "red", limiar: 5 },
    intencoes: { "Oi Gente": { exemplos: ["oi", "olá"], respostas: ["Oi"], acoes: [{ rotulo: "x", href: "javascript:x" }] }, vazia: { exemplos: ["a"] } },
    faq: [{ pergunta: "P?", resposta: "" }],
    catalogo: { url: "/api/produtos", linkModelo: "/p?id={id}", itens: [{ id: "a b", nome: "A" }] },
  });
  assert.equal(k.agente.cor, "#6d28d9");
  assert.equal(k.agente.limiar, 0.55);
  assert.deepEqual(Object.keys(k.intencoes), ["oi_gente"]);
  assert.deepEqual(k.intencoes.oi_gente.acoes, []);
  assert.equal(k.faq.length, 0);
  assert.equal(k.catalogo.itens[0].link, "/p?id=a%20b");
  assert.equal(problems.length, 3);
});

test("capacidades: só navegação interna, declarada e sem efeito colateral", () => {
  const { knowledge: k, problems } = checkKnowledge({
    acoes: {
      padrao: "permitir",
      acoes: [
        { id: "abrir ajuda", tipo: "navegar", rotulo: "Abrir ajuda", href: "/ajuda" },
        { id: "externa", tipo: "navegar", rotulo: "Abrir fora", href: "https://exemplo.com" },
        { id: "pagamento", tipo: "pagar", rotulo: "Cobrar", href: "/checkout" },
        { id: "script", tipo: "navegar", rotulo: "Executar", href: "javascript:alert(1)" },
      ],
    },
  });
  assert.equal(k.acoes.padrao, "negar");
  assert.deepEqual(k.acoes.acoes, [{ id: "abrir-ajuda", tipo: "navegar", rotulo: "Abrir ajuda", href: "/ajuda", permissao: "publico", confirmacao: false }]);
  assert.match(problems.join(" "), /acoes\.externa/);
  assert.match(problems.join(" "), /acoes\.pagamento/);
  assert.match(problems.join(" "), /acoes\.script/);
});

test("glossário: classifica interações sensíveis sem habilitá-las", () => {
  assert.deepEqual(classifyInteraction({ metodo: "POST", caminho: "/api/checkout" }), { categoria: "pagamento", risco: "critico", motivo: "Pode envolver cobrança, preço, checkout ou meio de pagamento." });
  assert.equal(classifyInteraction({ metodo: "GET", caminho: "/api/orders" }).categoria, "dados_da_conta");
  const candidates = candidatesFromReport({
    rotas: [{ metodo: "POST", caminho: "/api/contato" }],
    formularios: [{ method: "post", action: "/api/contato", campos: ["E-mail", "Mensagem"] }],
  });
  assert.equal(candidates.length, 1);
  assert.deepEqual([candidates[0].categoria, candidates[0].risco, candidates[0].estado], ["dados_pessoais", "alto", "bloqueada"]);
});

test("avaliação do exemplo: base coerente e perguntas e páginas encontradas", () => {
  const r = evaluateKnowledge(knowledge, { extra: [{ frase: "como pago", espera: "faq:quais-formas-de-pagamento-voces-aceitam" }, { frase: "oi", espera: "saudacao" }] });
  assert.equal(r.porcentagens.treino, 100);
  assert.equal(r.porcentagens.faq, 100);
  assert.equal(r.porcentagens.paginas, 100);
  assert.equal(r.porcentagens.frases, 100);
  assert.ok(r.geral >= 95);
});
