// Agente reutilizável: entende a intenção da frase (Naive Bayes), procura a resposta na base do
// site (perguntas frequentes, páginas e catálogo) e devolve texto, botões e itens. Roda igual no
// navegador e no Node, sem internet, sem chave de IA e sem custo.
import { train, classify } from "./classifier.js";
import { normalize, tokens } from "./text.js";
import { createIndex, strong, weak } from "./search.js";
import { checkKnowledge } from "./knowledge.js";
import { catalogVocab, extractEntities, hasEntities, matchesEntities, colorsIn, describeEntities, FOLLOW_UP, COMPARE, DETAIL, pickOrdinals, compareItems } from "./entities.js";

const MORE = /^(mais|outr[oa]s?|mais (opcoes|opcao|itens|produtos|resultados)|tem mais|mostra mais|ver mais)\b/;
const CATALOG_WORDS = /\b(comprar|melhor|indica|recomenda|sugere|sugestao|compra|preco|precos|valor|custa|custam|barat[oa]s?|car[oa]s?|produtos?|itens?|opcoes|modelos?|tem algum|tem alguma|quero (um|uma)|procuro|procurando|vende|vendem|catalogo|ate r?\$?\s?\d)/;
const PRICE_TEXT = /\b(ate|menos de|no maximo|maximo|abaixo de|por ate)?\s*(r\$\s*)?\d[\d.,]*\s*(mil|k|reais|conto|pila)?\b/g;
const BUY_WORDS = /\b(quero|queria|procuro|procurando|preciso|comprar|compra|tem|algum|alguma|um|uma|opcoes|opcao|barat[oa]s?|preco|precos|valor|qual|quais|melhor|melhores|bom|boa|indica|recomenda|sugere|sugestao|me (indica|mostra|recomenda))\b/g;
const PAGE_WORDS = /\b(onde|pagina|link|acessar|acesso|abrir|abro|ir para|vou para|encontro|fica|achar|acho)\b/;
// "procurar/buscar X no site": vira link pronto da busca do próprio site (consultas.buscas).
const SEARCH = /^(?:(?:eu )?(?:quero|queria|preciso|pode|consegue|me ajuda a)\s+)?(?:procur\w*|busc\w*|pesquis\w*|encontr\w*|achar|ache)\s+(?:por\s+|pel[oa]s?\s+|um\s+|uma\s+|o\s+|a\s+)?(.{2,60}?)(?:\s+no site|\s+na loja|\s+aqui)?[?!.]*$/;
// Versão 0.7: pedido de definição ("o que é CT-e?", "what is an API?") e de explicação ("me fala
// sobre a reciclagem", "como funciona o plano"). O resto da frase é o assunto.
const DEFINE = /^(?:(?:e|mas|ah|entao)\s+)?(?:o que (?:e|eh|sao|significa|quer dizer)|oq (?:e|eh|significa)|que e|qual (?:o )?significado d[eoa]s?|significado d[eoa]s?|defin(?:e|a|icao de)|what(?:'s| is| are| does)|meaning of)\s+(?:o |a |os |as |um |uma |an? |the )?(.{2,60}?)(?:\s+(?:mean|significa))?\s*[?!.]*$/;
const EXPLAIN = /^(?:(?:me |pode |poderia )?(?:explica\w*|fala\w*|conta\w*|fale|conte)\s+(?:sobre|de|do|da|dos|das|o que e|como funciona)\s+|(?:como funciona|quero saber (?:mais )?sobre|saber mais sobre|informacoes sobre|tell me about|explain)\s+)(?:o |a |os |as )?(.{2,80}?)\s*[?!.]*$/;
// Interações que já têm intenção própria na base (contato, conta): o classificador não as treina
// de novo, para não dividir os exemplos; a busca ainda acha a interação pelo título.
const SHARED_TYPES = new Set(["contato", "login", "cadastro", "busca"]);
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
  const { agente, intencoes, faq, paginas, catalogo, fluxos, consultas, setor, conteudos, interacoes } = knowledge;
  // Fluxos (conversa em etapas) e consultas da conta entram no classificador como intenções.
  const examples = {
    ...Object.fromEntries(Object.entries(intencoes).map(([k, v]) => [k, v.exemplos])),
    ...Object.fromEntries(fluxos.map((f) => [`fluxo__${f.id}`, f.gatilhos])),
    ...Object.fromEntries(consultas.dados.map((d) => [`consulta__${d.id}`, d.exemplos])),
    ...Object.fromEntries(interacoes.filter((x) => x.exemplos.length >= 2 && !SHARED_TYPES.has(x.tipo)).map((x) => [`interacao__${x.id}`, x.exemplos])),
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
    // Versão 0.7: glossário do setor, resumos de conteúdo e interações do site.
    ...setor.glossario.map((g) => ({ id: g.id, tipo: "glossario", principal: g.termo, medio: g.sinonimos.join(" "), secundario: g.definicao, dados: g })),
    ...conteudos.map((c) => ({ id: c.id, tipo: "conteudo", principal: c.titulo, medio: c.topicos, secundario: c.resumo, dados: c })),
    ...interacoes.map((x) => ({ id: x.id, tipo: "interacao", principal: x.titulo, medio: x.exemplos.slice(0, 8).join(" "), secundario: x.resumo, dados: x })),
  ], { sinonimos: setor.sinonimos });
  const fmt = (v) => money(v, agente);
  const vocab = catalogVocab(catalogo.itens);
  const itemById = (id) => catalogo.itens.find((p) => p.id === id);
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
    return d && { texto: `Vou consultar ${d.rotulo} da sua conta...`, consulta: { id: d.id, rotulo: d.rotulo, url: d.url, campos: d.campos, pagina: d.pagina, login: consultas.login, ...(consultas.auth ? { auth: consultas.auth } : {}) } };
  };
  const searchLink = (term) => {
    const b = consultas.buscas[0];
    const t = String(term || "").trim().slice(0, 60);
    return b && t ? { rotulo: `Buscar “${t}”`.slice(0, 60), href: b.modelo.replace("{termo}", encodeURIComponent(t)) } : null;
  };

  const interactionById = (id) => interacoes.find((x) => x.id === id);
  // Interação: para que serve, o que pedir e o botão que leva até a parte do site que faz aquilo.
  const answerInteraction = (x) => ({
    texto: `${x.resumo} Te levo até lá:`,
    acoes: [
      { rotulo: (/^https?:/i.test(x.link) ? x.titulo || "Abrir" : `Ir para ${x.titulo}`).slice(0, 60), href: x.link },
      ...(x.requerLogin && consultas.login && consultas.login !== x.link ? [{ rotulo: "Entrar na conta", href: consultas.login }] : []),
    ],
    fonte: x.id,
  });
  // Conteúdo: introdução curta (resumo extraído do próprio texto) e o link para o original.
  const answerContent = (c) => ({
    texto: `Resumindo "${c.titulo}": ${c.resumo}${c.link ? " O texto completo está no link abaixo." : ""}`,
    acoes: c.link ? [{ rotulo: "Ler o conteúdo completo", href: c.link }] : [],
    fonte: c.id,
  });
  // Glossário do setor: definição geral; se o site fala do assunto, aponta para lá.
  const answerGlossary = (g) => {
    const related = index.search(`${g.termo} ${g.sinonimos.slice(0, 2).join(" ")}`, { limit: 6 }).find((h) => ["conteudo", "faq", "pagina", "interacao"].includes(h.doc.tipo) && h.hits >= 1 && h.ratio >= 0.4);
    const link = related && (related.doc.dados.link || related.doc.dados.href);
    return {
      texto: `${g.termo}: ${g.definicao} (explicação geral${link ? `; veja como funciona em ${agente.site}` : ""}).`,
      acoes: link ? [{ rotulo: (related.doc.dados.titulo || related.doc.dados.pergunta || "Ver no site").slice(0, 60), href: link }] : [],
      fonte: g.id,
    };
  };
  const answerDoc = (doc) =>
    ({ faq: answerFaq, pagina: answerPage, glossario: answerGlossary, conteudo: answerContent, interacao: answerInteraction })[doc.tipo]?.(doc.dados) || answerPage(doc.dados);
  // Rótulo curto para "Você quis dizer...?" a partir de uma intenção candidata.
  const labelFor = (name) => {
    if (name.startsWith("interacao__")) return interactionById(name.slice(11))?.titulo;
    if (name.startsWith("fluxo__")) return flowById(name.slice(7))?.gatilhos[0];
    if (name.startsWith("consulta__")) return consultas.dados.find((d) => d.id === name.slice(10))?.exemplos[0];
    return intencoes[name]?.exemplos.find((e) => e.split(" ").length >= 2) || intencoes[name]?.exemplos[0];
  };

  function answerIntent(name, turn) {
    if (name.startsWith("interacao__")) return answerInteraction(interactionById(name.slice(11)));
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

  // base: filtros da busca anterior (memória: "e em azul?", "e até 200?").
  // force: o que o cliente acabou de pedir vale mais que o texto da busca anterior.
  // reuse: continuação da busca anterior; as entidades já vêm em base (não relê o texto antigo).
  function answerCatalog(text, page = 0, base = {}, force = {}, { reuse = false } = {}) {
    const own = reuse ? {} : extractEntities(text, vocab);
    const ent = { ...base, ...own, ...force };
    delete ent.busca;
    const price = extractPrice(text);
    const max = force.max ?? price ?? base.max ?? null;
    if (max != null) ent.max = max;
    // Sem o valor e sem as palavras de compra, sobra o assunto ("quero um café até 50" → "café").
    const subject = normalize(text)
      .replace(PRICE_TEXT, " ")
      .replace(BUY_WORDS, " ");
    // No catálogo basta uma palavra do nome/categoria: "café para presente" ainda mostra cafés.
    const found = subject.trim() ? index.search(subject, { tipo: "item", limit: 60 }).filter((h) => h.hits >= 1 && h.ratio >= 0.25) : [];
    let pool = found.length ? found.map((h) => h.doc.dados) : catalogo.itens;
    const label = catalogo.rotulo;
    // Versão 0.4: categoria, cor, marca e tamanho filtram de verdade.
    if (hasEntities(ent)) {
      const within = pool.filter((p) => matchesEntities(p, ent));
      const anywhere = within.length ? within : catalogo.itens.filter((p) => matchesEntities(p, ent));
      if (!anywhere.length) {
        const sem = { ...ent, cor: undefined };
        const others = ent.cor ? colorsIn(catalogo.itens.filter((p) => matchesEntities(p, sem)), vocab) : [];
        return {
          texto: `Não encontrei ${describeEntities(ent, fmt) || label}.${others.length ? ` Tenho em: ${others.join(", ")}.` : ""}`,
          sugestoes: others.slice(0, 3).map((c) => `E em ${c}?`),
          itens: [],
          contexto: { busca: (base.busca || text).slice(0, 200), pagina: 0, filtros: Object.fromEntries(Object.entries({ ...ent, cor: undefined }).filter(([, v]) => v != null)) },
        };
      }
      pool = anywhere;
    }
    if (ent.ordem === "asc") pool = [...pool].sort((a, b) => (a.preco ?? Infinity) - (b.preco ?? Infinity));
    else if (ent.ordem === "desc") pool = [...pool].sort((a, b) => (b.preco ?? -1) - (a.preco ?? -1));
    if (max != null) {
      const within = pool.filter((p) => p.preco != null && p.preco <= max).sort((a, b) => a.preco - b.preco);
      if (!within.length) {
        const cheapest = pool.filter((p) => p.preco != null).sort((a, b) => a.preco - b.preco)[0];
        return {
          texto: cheapest
            ? `Não encontrei ${describeEntities({ ...ent, max: null }, fmt) || label} até ${fmt(max)}. O mais em conta é ${cheapest.nome}, por ${fmt(cheapest.preco)}.`
            : `Não encontrei ${describeEntities({ ...ent, max: null }, fmt) || label} até ${fmt(max)}.`,
          itens: cheapest ? [card(cheapest)] : [],
          contexto: { busca: (base.busca || text).slice(0, 200), pagina: 0, filtros: Object.fromEntries(Object.entries({ ...ent, max: undefined }).filter(([, v]) => v != null)), ultimos: cheapest ? [cheapest.id] : [] },
        };
      }
      pool = within;
    }
    if (!found.length && max == null && !hasEntities(ent) && !ent.ordem) {
      const s = searchLink(subject.replace(/\s+/g, " "));
      return s ? { texto: `Não achei isso na lista que eu conheço, mas a busca do site pode ter:`, acoes: [s], itens: [] } : null;
    }
    const slice = pool.slice(page * 3, page * 3 + 3);
    if (!slice.length) return { texto: `Não tenho mais ${label} para essa busca.`, itens: [] };
    const more = pool.length > (page + 1) * 3;
    const desc = describeEntities({ ...ent, max: null }, fmt);
    const tips = [...(more ? ["Mais opções"] : []), ...(slice.length >= 2 ? ["Compara os dois primeiros"] : []), ...(ent.ordem !== "asc" && slice.length >= 2 ? ["O mais barato"] : [])];
    return {
      texto: `${page ? "Mais opções" : `Encontrei ${pool.length === 1 ? "1 opção" : `${pool.length} opções`}`}${desc && !page ? ` (${desc})` : ""}${max != null ? ` até ${fmt(max)}` : ""}${ent.ordem === "asc" ? ", da mais em conta" : ent.ordem === "desc" ? ", da mais completa" : ""}:`,
      itens: slice.map(card),
      sugestoes: tips,
      contexto: { busca: (base.busca || text).slice(0, 200), pagina: page, filtros: Object.fromEntries(Object.entries(ent).filter(([, v]) => v != null && v !== "")), ultimos: slice.map((p) => p.id) },
    };
  }

  function followUp(text, n, contexto) {
    const last = Array.isArray(contexto?.ultimos) ? contexto.ultimos.map(itemById).filter(Boolean) : [];
    if ((!last.length && typeof contexto?.busca !== "string") || !catalogo.itens.length) return null;
    const words = n.split(" ").length;
    const picks = pickOrdinals(text).filter((i) => last[i]);
    if (COMPARE.test(n) && last.length === 1)
      return { intencao: "comparar", r: { texto: `Nessa busca só apareceu ${last[0].nome}. Me diga o que mais você quer ver que eu comparo.`, itens: [card(last[0])], sugestoes: [], contexto } };
    if (COMPARE.test(n) && last.length >= 2) {
      const chosen = (picks.length >= 2 ? picks : [0, 1]).map((i) => last[i]);
      return { intencao: "comparar", r: { texto: compareItems(chosen, fmt), itens: chosen.map(card), sugestoes: ["Mais opções"], contexto: { ...contexto, pagina: contexto.pagina || 0 } } };
    }
    if (picks.length === 1 && (DETAIL.test(n) || words <= 4)) {
      const it = last[picks[0]];
      return {
        intencao: "detalhe",
        r: { texto: `${it.nome}${it.preco != null ? `, por ${fmt(it.preco)}` : ""}.${it.descricao ? ` ${it.descricao}` : ""}`, itens: [card(it)], acoes: it.link ? [{ rotulo: "Ver a página", href: it.link }] : [], sugestoes: last.length >= 2 ? ["Compara os dois primeiros", "Mais opções"] : [], contexto },
      };
    }
    const ent = extractEntities(text, vocab);
    const price = extractPrice(text);
    const base = { ...(contexto.filtros || {}), busca: contexto.busca };
    if (ent.ordem && words <= 4 && !hasEntities(ent)) {
      // "O mais barato" é o mais barato de todos com os mesmos filtros (sem o teto de preço).
      const r = answerCatalog(contexto.busca || "", 0, ent.ordem === "asc" ? { ...base, max: undefined } : base, { ordem: ent.ordem }, { reuse: true });
      return r && { intencao: "catalogo", r };
    }
    if ((FOLLOW_UP.test(n) && (hasEntities(ent) || price != null) && words <= 6) || (words <= 2 && (ent.cor || ent.tamanho))) {
      const force = Object.fromEntries(Object.entries({ ...ent, max: price ?? undefined }).filter(([, v]) => v != null));
      const r = answerCatalog(contexto.busca || text, 0, base, force, { reuse: true });
      return r && { intencao: "catalogo", r };
    }
    return null;
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

    // Versão 0.4: memória da última lista ("compara os dois", "o segundo", "e em azul?").
    const memory = followUp(text, n, contexto);
    if (memory) return done(memory.r, memory.intencao, 0.9);
    if (MORE.test(n) && n.split(" ").length <= 3) {
      const next = typeof contexto?.busca === "string" && answerCatalog(contexto.busca, Math.min((contexto.pagina || 0) + 1, 20), { ...(contexto.filtros || {}), busca: contexto.busca });
      if (next) return done(next, "catalogo");
      return done({ texto: "Mais sobre o quê? Me diga o que você procura.", sugestoes: defaultChips() }, "mais_sem_contexto", 0.5);
    }

    if (searchMatch) {
      const own = catalogo.itens.length ? answerCatalog(searchMatch[1]) : null;
      if (own?.itens?.length) return done(own, "catalogo", 0.8);
      const s = searchLink(searchMatch[1]);
      if (s) return done({ texto: `Pesquisei para você: abra os resultados de “${searchMatch[1].trim()}” no site.`, acoes: [s] }, "busca", 0.8);
    }
    // Versão 0.7: "o que é X?" responde com o glossário do setor (ou um conteúdo do site);
    // "me explica X" / "como funciona X" responde com o resumo do conteúdo e o link.
    // Resposta ao "Você quis dizer...?": nenhuma das opções → pede outras palavras e mostra a equipe.
    if (/^(nenhuma|nenhum|nao) ?(dessas|desses|delas|deles|das opcoes)?$/.test(n) && contexto?.falhas)
      return done({ texto: `Tudo bem. Me conta com outras palavras o que você procura${intencoes.contato ? `, ou fale direto com a equipe de ${agente.site}` : ""}.`, acoes: intencoes.contato?.acoes || [], sugestoes: defaultChips(), contexto: { falhas: contexto.falhas } }, "nenhuma_opcao", 1);
    const define = n.match(DEFINE);
    const explain = !define && n.match(EXPLAIN);
    if (define || explain) {
      const subject = (define || explain)[1];
      const order = define ? ["glossario", "faq", "conteudo", "interacao"] : ["conteudo", "faq", "interacao", "glossario", "pagina"];
      const found = index.search(subject, { limit: 8 }).filter((h) => order.includes(h.doc.tipo) && strong(h));
      const pick = order.map((t) => found.find((h) => h.doc.tipo === t)).find(Boolean);
      if (pick) return done(answerDoc(pick.doc), pick.doc.tipo, pick.ratio);
    }
    const ranked = model ? classify(model, text) : [];
    const top = ranked[0];
    const confident = Boolean(top && top.p >= agente.limiar && top.coverage >= 0.5);
    const words = tokens(text).length;
    // O glossário do setor é conhecimento geral: só responde quando o próprio site não tem nada
    // forte sobre o assunto (a FAQ "qual o prazo de entrega?" do site vence a definição geral).
    const allHits = index.search(text, { limit: 6 });
    const hits = allHits.filter((h) => h.doc.tipo !== "glossario").slice(0, 3);
    const glossHit = allHits.find((h) => h.doc.tipo === "glossario" && strong(h));
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
      // Página que é a porta de uma interação: a interação explica para que serve antes do link.
      const viaInteraction = chosen.doc.tipo === "pagina" && !wantsPage && hits.find((h) => h.doc.tipo === "interacao" && h.doc.dados.link === chosen.doc.dados.href && weak(h));
      const final = viaInteraction || chosen;
      return done(answerDoc(final.doc), final.doc.tipo, final.ratio);
    }
    if (asksCatalog) {
      const r = answerCatalog(text);
      if (r) return done(r, "catalogo", hits[0]?.ratio || 0.5);
    }
    if (confident) return done(answerIntent(top.intent, turn), top.intent, top.p);
    if (glossHit) return done(answerGlossary(glossHit.doc.dados), "glossario", glossHit.ratio);
    if (weak(best)) {
      const r = answerDoc(best.doc);
      return done({ ...r, texto: `Talvez isto ajude: ${r.texto}`, sugestoes: defaultChips() }, `${best.doc.tipo}-provavel`, best.ratio);
    }
    // Versão 0.7: recuperação em etapas. 1ª falha: "Você quis dizer...?" com os candidatos mais
    // próximos; 2ª seguida: oferece o atendimento humano (com os contatos), em vez de repetir.
    const falhas = (Number.isInteger(contexto?.falhas) ? contexto.falhas : 0) + 1;
    const guesses = [...new Set(ranked.filter((r) => r.p >= 0.2 && r.coverage >= 0.34).slice(0, 2).map((r) => labelFor(r.intent)).filter(Boolean))].map((g) => g.slice(0, 60));
    if (falhas >= 2 && intencoes.contato)
      return done({ texto: `Ainda não consegui entender, desculpe. Prefere falar com uma pessoa da equipe de ${agente.site}? Ou escreva de outro jeito, com outras palavras.`, acoes: intencoes.contato.acoes, sugestoes: guesses.length ? guesses : defaultChips(), contexto: { falhas } }, "nao_entendi", top?.p || 0);
    if (guesses.length) return done({ texto: "Não tenho certeza se entendi. Você quis dizer:", sugestoes: [...guesses, "Nenhuma dessas"], contexto: { falhas } }, "voce_quis_dizer", top?.p || 0);
    return done({ texto: agente.naoEntendi, sugestoes: defaultChips(), acoes: intencoes.contato?.acoes || [], contexto: { falhas } }, "nao_entendi", top?.p || 0);
  }

  return { reply, knowledge, problems, saudacao: () => ({ texto: agente.saudacao, sugestoes: defaultChips() }) };
}
