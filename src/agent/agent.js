// Agente reutilizável: entende a intenção da frase (Naive Bayes), procura a resposta na base do
// site (perguntas frequentes, páginas e catálogo) e devolve texto, botões e itens. Roda igual no
// navegador e no Node, sem internet, sem chave de IA e sem custo.
import { train, classify } from "./classifier.js";
import { normalize, tokens } from "./text.js";
import { createIndex, strong, weak } from "./search.js";
import { checkKnowledge } from "./knowledge.js";

const MORE = /^(mais|outr[oa]s?|mais (opcoes|opcao|itens|produtos|resultados)|tem mais|mostra mais|ver mais)\b/;
const CATALOG_WORDS = /\b(comprar|melhor|indica|recomenda|sugere|sugestao|compra|preco|precos|valor|custa|custam|barat[oa]s?|car[oa]s?|produtos?|itens?|opcoes|modelos?|tem algum|tem alguma|quero (um|uma)|procuro|procurando|vende|vendem|catalogo|ate r?\$?\s?\d)/;
const PRICE_TEXT = /\b(ate|menos de|no maximo|maximo|abaixo de|por ate)?\s*(r\$\s*)?\d[\d.,]*\s*(mil|k|reais|conto|pila)?\b/g;
const BUY_WORDS = /\b(quero|queria|procuro|procurando|preciso|comprar|compra|tem|algum|alguma|um|uma|opcoes|opcao|barat[oa]s?|preco|precos|valor|qual|quais|melhor|melhores|bom|boa|indica|recomenda|sugere|sugestao|me (indica|mostra|recomenda))\b/g;
const PAGE_WORDS = /\b(onde|pagina|link|acessar|acesso|abrir|abro|ir para|vou para|encontro|fica|achar|acho)\b/;
// "procurar/buscar X no site": vira link pronto da busca do próprio site (consultas.buscas).
const SEARCH = /^(?:(?:eu )?(?:quero|queria|preciso|pode|consegue|me ajuda a)\s+)?(?:procur\w*|busc\w*|pesquis\w*|encontr\w*|achar|ache)\s+(?:por\s+|pel[oa]s?\s+|um\s+|uma\s+|o\s+|a\s+)?(.{2,60}?)(?:\s+no site|\s+na loja|\s+aqui)?[?!.]*$/;
const ORDINAL = { 1: ["1", "um", "primeir", "a primeira", "o primeiro"], 2: ["2", "dois", "duas", "segund"], 3: ["3", "tres", "terceir"], 4: ["4", "quatro", "quart"] };

// "até R$ 1.500", "menos de 300", "500 reais", "no máximo 2 mil" → valor máximo em reais.
export function extractPrice(text) {
  const t = normalize(text);
  const m =
    t.match(/\b(?:ate|menos de|no maximo|maximo|abaixo de|por ate)\s*(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?\s*(mil|k)?\b/) ||
    t.match(/\b(?:r\$\s*)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?\s*(mil|k)?\b/) ||
    t.match(/\b(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?\s*(mil|k)?\s*(?:reais|conto|pila)\b/);
  if (!m) return null;
  let value = Number(m[1].replace(/\./g, "")) + (m[2] ? Number(m[2]) / 100 : 0);
  if (m[3]) value *= 1000;
  return value > 0 ? value : null;
}

export function money(value, { idioma = "pt-BR", moeda = "BRL" } = {}) {
  try {
    return new Intl.NumberFormat(idioma, { style: "currency", currency: moeda }).format(value);
  } catch {
    return `${moeda} ${Number(value).toFixed(2)}`;
  }
}

const fill = (text, agente) => text.replaceAll("{site}", agente.site).replaceAll("{nome}", agente.nome);

export function createAgent(input) {
  const { knowledge, problems } = checkKnowledge(input);
  const { agente, intencoes, faq, paginas, catalogo, fluxos, consultas } = knowledge;
  // Fluxos (conversa em etapas) e consultas da conta entram no classificador como intenções.
  const examples = {
    ...Object.fromEntries(Object.entries(intencoes).map(([k, v]) => [k, v.exemplos])),
    ...Object.fromEntries(fluxos.map((f) => [`fluxo__${f.id}`, f.gatilhos])),
    ...Object.fromEntries(consultas.dados.map((d) => [`consulta__${d.id}`, d.exemplos])),
  };
  const model = Object.keys(examples).length >= 2 ? train(examples) : null;
  const index = createIndex([
    ...faq.map((f) => ({ id: f.id, tipo: "faq", principal: f.pergunta, medio: f.termos, secundario: f.resposta, dados: f })),
    ...paginas.map((p) => ({ id: p.id, tipo: "pagina", principal: p.titulo, medio: p.termos, secundario: p.descricao, dados: p })),
    ...catalogo.itens.map((p) => ({
      id: p.id,
      tipo: "item",
      principal: `${p.nome} ${p.categoria}`,
      medio: p.tags.join(" "),
      secundario: p.descricao,
      dados: p,
    })),
  ]);
  const fmt = (v) => money(v, agente);
  const card = (p) => ({ id: p.id, nome: p.nome, preco: p.preco, precoTexto: p.preco == null ? "" : fmt(p.preco), link: p.link, imagem: p.imagem, descricao: p.descricao });
  const defaultChips = () => agente.sugestoes.length ? agente.sugestoes : faq.slice(0, 3).map((f) => f.pergunta.slice(0, 60));

  const flowById = (id) => fluxos.find((f) => f.id === id);
  const askFlow = (f) => ({ texto: fill(f.pergunta, agente), sugestoes: f.opcoes.map((o) => o.rotulo), contexto: { fluxo: f.id } });
  // Opção escolhida pelo texto do botão, por parte dele ("retirada") ou pela posição ("a segunda").
  function pickOption(f, text) {
    const n = normalize(text);
    const words = new Set(tokens(text));
    const exact = f.opcoes.find((o) => normalize(o.rotulo) === n);
    if (exact) return exact;
    for (const [pos, names] of Object.entries(ORDINAL)) if (f.opcoes[pos - 1] && names.some((w) => n === w || n.startsWith(`${w} `) || n.startsWith(`${w}a`) || n.startsWith(`${w}o`))) return f.opcoes[pos - 1];
    const scored = f.opcoes.map((o) => {
      const t = tokens(o.rotulo).filter((w) => w.length > 2);
      return { o, r: t.length ? t.filter((w) => words.has(w)).length / t.length : 0 };
    });
    const best = scored.sort((a, b) => b.r - a.r)[0];
    return best && best.r >= 0.5 ? best.o : null;
  }
  const lookupFor = (id) => {
    const d = consultas.dados.find((x) => x.id === id);
    return d && { texto: `Vou consultar ${d.rotulo} da sua conta...`, consulta: { id: d.id, rotulo: d.rotulo, url: d.url, campos: d.campos, pagina: d.pagina, login: consultas.login } };
  };
  const searchLink = (term) => {
    const b = consultas.buscas[0];
    const t = String(term || "").trim().slice(0, 60);
    return b && t ? { rotulo: `Buscar “${t}”`.slice(0, 60), href: b.modelo.replace("{termo}", encodeURIComponent(t)) } : null;
  };

  function answerIntent(name, turn) {
    if (name.startsWith("fluxo__")) return askFlow(flowById(name.slice(7)));
    if (name.startsWith("consulta__")) return lookupFor(name.slice(10));
    const it = intencoes[name];
    return {
      texto: fill(it.respostas[turn % it.respostas.length], agente),
      acoes: it.acoes,
      sugestoes: it.sugestoes.length ? it.sugestoes : name === "saudacao" || name === "ajuda" ? defaultChips() : [],
    };
  }
  const answerFaq = (f) => ({ texto: f.resposta, acoes: f.link ? [{ rotulo: "Saiba mais", href: f.link }] : [], fonte: f.id });
  const answerPage = (p) => ({
    texto: `Você encontra isso em "${p.titulo}".${p.descricao ? ` ${p.descricao}` : ""}`,
    acoes: [{ rotulo: `Abrir ${p.titulo}`.slice(0, 60), href: p.href }],
    fonte: p.id,
  });

  function answerCatalog(text, page = 0) {
    const max = extractPrice(text);
    // Sem o valor e sem as palavras de compra, sobra o assunto ("quero um café até 50" → "café").
    const subject = normalize(text)
      .replace(PRICE_TEXT, " ")
      .replace(BUY_WORDS, " ");
    // No catálogo basta uma palavra do nome/categoria: "café para presente" ainda mostra cafés.
    const found = subject.trim() ? index.search(subject, { tipo: "item", limit: 60 }).filter((h) => h.hits >= 1 && h.ratio >= 0.25) : [];
    let pool = found.length ? found.map((h) => h.doc.dados) : catalogo.itens;
    const label = catalogo.rotulo;
    if (max != null) {
      const within = pool.filter((p) => p.preco != null && p.preco <= max).sort((a, b) => a.preco - b.preco);
      if (!within.length) {
        const cheapest = pool.filter((p) => p.preco != null).sort((a, b) => a.preco - b.preco)[0];
        return {
          texto: cheapest
            ? `Não encontrei ${label} até ${fmt(max)}. O mais em conta é ${cheapest.nome}, por ${fmt(cheapest.preco)}.`
            : `Não encontrei ${label} até ${fmt(max)}.`,
          itens: cheapest ? [card(cheapest)] : [],
        };
      }
      pool = within;
    }
    if (!found.length && max == null) {
      const s = searchLink(subject.replace(/\s+/g, " "));
      return s ? { texto: `Não achei isso na lista que eu conheço, mas a busca do site pode ter:`, acoes: [s], itens: [] } : null;
    }
    const slice = pool.slice(page * 3, page * 3 + 3);
    if (!slice.length) return { texto: `Não tenho mais ${label} para essa busca.`, itens: [] };
    const more = pool.length > (page + 1) * 3;
    return {
      texto: `${page ? "Mais opções" : `Encontrei ${pool.length === 1 ? "1 opção" : `${pool.length} opções`}`}${max != null ? ` até ${fmt(max)}` : ""}:`,
      itens: slice.map(card),
      sugestoes: more ? ["Mais opções"] : [],
      contexto: { busca: text.slice(0, 200), pagina: page },
    };
  }

  // contexto: o que a resposta anterior devolveu (o widget guarda e manda de volta).
  function reply(mensagem, contexto = {}) {
    const text = String(mensagem ?? "").slice(0, 500);
    const turn = Number.isInteger(contexto?.voltas) && contexto.voltas >= 0 ? contexto.voltas : 0;
    const done = (r, intencao, confianca = 1) => ({
      texto: r.texto,
      acoes: r.acoes || [],
      itens: r.itens || [],
      sugestoes: r.sugestoes || [],
      intencao,
      confianca: Math.round(confianca * 100) / 100,
      ...(r.fonte ? { fonte: r.fonte } : {}),
      ...(r.consulta ? { consulta: r.consulta } : {}),
      contexto: { voltas: turn + 1, ...(r.contexto || {}) },
    });
    const n = normalize(text);
    if (!n) return done({ texto: agente.vazio }, "vazio", 0);

    // Resposta a uma pergunta do fluxo: escolhe a opção e segue (ou encadeia o próximo passo).
    const pending = typeof contexto?.fluxo === "string" && flowById(contexto.fluxo);
    if (pending) {
      const option = pickOption(pending, text);
      if (option) {
        const next = option.proximo && flowById(option.proximo);
        if (next) return done(option.resposta ? { ...askFlow(next), texto: `${fill(option.resposta, agente)} ${fill(next.pergunta, agente)}` } : askFlow(next), `fluxo__${next.id}`, 1);
        return done({ texto: fill(option.resposta, agente), acoes: option.acoes, sugestoes: defaultChips() }, `fluxo__${pending.id}`, 1);
      }
    }
    // "procurar X": busca do próprio site, quando existe e o catálogo não resolve.
    const searchMatch = consultas.buscas.length && n.match(SEARCH);

    if (MORE.test(n) && n.split(" ").length <= 3) {
      const next = typeof contexto?.busca === "string" && answerCatalog(contexto.busca, Math.min((contexto.pagina || 0) + 1, 20));
      if (next) return done(next, "catalogo");
      return done({ texto: "Mais sobre o quê? Me diga o que você procura.", sugestoes: defaultChips() }, "mais_sem_contexto", 0.5);
    }

    if (searchMatch) {
      const own = catalogo.itens.length ? answerCatalog(searchMatch[1]) : null;
      if (own?.itens?.length) return done(own, "catalogo", 0.8);
      const s = searchLink(searchMatch[1]);
      if (s) return done({ texto: `Pesquisei para você: abra os resultados de “${searchMatch[1].trim()}” no site.`, acoes: [s] }, "busca", 0.8);
    }
    const ranked = model ? classify(model, text) : [];
    const top = ranked[0];
    const confident = Boolean(top && top.p >= agente.limiar && top.coverage >= 0.5);
    const words = tokens(text).length;
    const hits = index.search(text, { limit: 3 });
    const best = hits.find((h) => h.doc.tipo !== "item");
    const asksCatalog = catalogo.itens.length && (CATALOG_WORDS.test(n) || extractPrice(text) != null || hits[0]?.doc.tipo === "item");

    // Frase curta ou social ("oi", "obrigado") fica com a intenção; pergunta com assunto forte na
    // base ou pedido de produto com mais palavras vai para a busca.
    const itemHit = hits[0]?.doc.tipo === "item" && strong(hits[0]);
    const intentFirst = confident && (!strong(best) || (top.p >= 0.9 && words <= 3)) && !(asksCatalog && words > 3) && !itemHit;
    if (intentFirst || (confident && /^(fluxo|consulta)__/.test(top.intent) && !itemHit)) return done(answerIntent(top.intent, turn), top.intent, top.p);
    // Pedido de compra explícito ("quero um café", "até R$ 50") tenta o catálogo antes da base.
    if (catalogo.itens.length && (CATALOG_WORDS.test(n) || extractPrice(text) != null)) {
      const r = answerCatalog(text);
      if (r?.itens.length && (!strong(best) || hits[0]?.doc.tipo === "item" || r.contexto)) return done(r, "catalogo", hits[0]?.ratio || 0.5);
    }
    if (strong(best) && !(asksCatalog && hits[0]?.doc.tipo === "item" && hits[0].score > best.score)) {
      const wantsPage = PAGE_WORDS.test(n);
      // Pergunta respondida na FAQ vale mais que a página genérica, a não ser que peça a página.
      const faqHit = hits.find((h) => h.doc.tipo === "faq" && strong(h));
      const chosen = wantsPage ? hits.find((h) => h.doc.tipo === "pagina" && strong(h)) || best : best.doc.tipo === "pagina" && faqHit ? faqHit : best;
      // A página achada é a mesma da intenção ("falar com alguém" → Contato): a intenção responde
      // melhor (traz telefone, WhatsApp...).
      if (confident && chosen.doc.tipo === "pagina" && intencoes[top.intent]?.acoes.some((a) => a.href === chosen.doc.dados.href))
        return done(answerIntent(top.intent, turn), top.intent, top.p);
      return done(chosen.doc.tipo === "faq" ? answerFaq(chosen.doc.dados) : answerPage(chosen.doc.dados), chosen.doc.tipo, chosen.ratio);
    }
    if (asksCatalog) {
      const r = answerCatalog(text);
      if (r) return done(r, "catalogo", hits[0]?.ratio || 0.5);
    }
    if (confident) return done(answerIntent(top.intent, turn), top.intent, top.p);
    if (weak(best)) {
      const r = best.doc.tipo === "faq" ? answerFaq(best.doc.dados) : answerPage(best.doc.dados);
      return done({ ...r, texto: `Talvez isto ajude: ${r.texto}`, sugestoes: defaultChips() }, `${best.doc.tipo}-provavel`, best.ratio);
    }
    return done({ texto: agente.naoEntendi, sugestoes: defaultChips(), acoes: intencoes.contato?.acoes || [] }, "nao_entendi", top?.p || 0);
  }

  return { reply, knowledge, problems, saudacao: () => ({ texto: agente.saudacao, sugestoes: defaultChips() }) };
}
