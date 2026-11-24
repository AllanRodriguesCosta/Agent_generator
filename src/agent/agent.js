// Agente reutilizável: entende a intenção da frase (Naive Bayes), procura a resposta na base do
// site (perguntas frequentes, páginas e catálogo) e devolve texto, botões e itens. Roda igual no
// navegador e no Node, sem internet, sem chave de IA e sem custo.
import { train, classify } from "./classifier.js";
import { normalize, tokens } from "./text.js";
import { createIndex, strong, weak } from "./search.js";
import { checkKnowledge, activeView } from "./knowledge.js";
import { valueAt, fillTemplate, firstName, pickPhoto, photoRequest } from "./context.js";
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
// Versão 0.8: pedido de foto/galeria, sinais de frustração e divisão de perguntas múltiplas.
const MEDIA = /\b(fotos?|imagens?|galerias?|fotografias?|registros? fotograficos?|videos?)\b/;
const MEDIA_WORDS = /\b(quero|queria|ver|veja|mostra|mostrar|me mostra|manda|envia|tem|ha|a|o|as|os|da|do|das|dos|de|ultim[ao]s?|mais recentes?|recentes?|nova|novas|primeir[ao]s?|mais antig[ao]s?|fotos?|imagens?|galerias?|fotografias?|registros?|fotograficos?|videos?|postad[ao]s?|publicad[ao]s?|como esta|como ficou|anterior|seguinte|proxima)\b/g;
const OWN = /\b(meu|minha|meus|minhas)\b/;
const FRUSTRATION = /\b(absurdo|pessim[oa]|horrivel|ridiculo|palhacada|raiva|irritad[oa]|decepcionad[oa]|nunca chega|ninguem responde|ninguem me responde|descaso|vergonha|insatisfeit[oa]|cansad[oa] de esperar|ate agora nada|estou chateado|estou chateada|frustrad[oa])\b/;
const SPLIT_STARTS = "qual|quais|como|onde|quando|quanto|quantos|quantas|voc[eê]s|vcs|tem|t[eê]m|aceita|aceitam|fazem|faz|entregam|posso|d[aá] pra|[eé] poss[ií]vel|o que";
const SPLIT = new RegExp(`\\?\\s+(?=\\S)|;\\s*|\\s+e\\s+(?=(?:${SPLIT_STARTS})\\b)|,\\s*e\\s+(?=(?:${SPLIT_STARTS})\\b)`, "i");
const OPENERS = {
  amigavel: ["", "Claro! ", "Boa pergunta. ", "Vamos lá: ", "", "Certo! "],
  formal: ["", "Certamente. ", "Segue a informação: ", ""],
  neutro: [""],
};
const ORDINAL = { 1: ["1", "um", "primeir", "a primeira", "o primeiro"], 2: ["2", "dois", "duas", "segund"], 3: ["3", "tres", "terceir"], 4: ["4", "quatro", "quart"] };
// ---- Versão 0.10: conversa guiada ----
// Respostas curtas a uma pergunta do agente ("sim", "agora não", "todas", "cancelar").
const YES = /^(sim|s|pode|pode ser|claro|quero|vamos|bora|ok|okay|isso|beleza|por favor|manda|leva|sim,? vamos|preencher( comigo)?)\b/;
const NO = /^(nao|n|agora nao|depois|deixa|deixa pra la|nao obrigad[oa]|dispenso|nao precisa)\b/;
const ALL = /^(tod[oa]s?|ambos|ambas|os dois|as duas|tudo|cada um|cada uma)\b/;
const CANCEL = /^(cancelar|cancela|parar|para|desistir|desisto|esquece|deixa pra la|nao quero mais)\b/;
const QUESTION_LIKE = /\?\s*$|^(qual|quais|como|onde|quando|quanto|quantos|por que|porque|o que|voces|vcs|tem|aceita|aceitam)\b/;
// "explica melhor", "mais detalhes": versão longa da última resposta (M7).
const EXPLAIN_MORE = /^(explica(r)? melhor|explique melhor|me explica melhor|mais detalhes|detalha( mais)?|detalhe mais|fala mais|fale mais|conta mais|me conta mais|quero saber mais|saber mais|mais informac\w*|como assim|nao entendi direito|aprofunda\w*)\b/;
// Pedido de contato ("me liguem", "quero deixar meu contato"): captura conversacional (M6).
const LEAD = /\b(me liguem|me ligue|me liga|me retornem|me deem (um )?retorno|quero (um )?retorno|entr(em|e|ar) em contato comigo|deixar (o |meu |os meus |meus )?(contato|dados|telefone|e-?mail)|quero ser contatad[oa]|falar com (um |uma )?(vendedor|consultor|consultora|corretor|corretora|especialista)|preencher (o )?formulario|preenche (o )?formulario|me chamem)\b/;
const LEAD_TYPES = new Set(["orcamento", "contato", "agendamento", "reserva", "inscricao", "suporte", "parceria", "newsletter"]);
// Vídeos e PDFs (M8).
const VIDEO = /\b(videos?|assistir|tour virtual|filme|filmagem)\b/;
const FILE = /\b(pdfs?|memorial|cardapio|folder|folheto|brochura|manual|regulamento|edital|tabela|plantas?|apresentacao|baixar|download|arquivos?|documentos?|e-?book)\b/;
const CARD_WORDS = /\b(quero|queria|ver|veja|mostra|mostrar|me mostra|manda|envia|tem|ha|a|o|as|os|da|do|das|dos|de|um|uma|algum|alguma|videos?|assistir|tour virtual|filme|filmagem|pdfs?|arquivos?|documentos?|baixar|download|link|para|pra|sobre|no|na|em|o site|do site)\b/g;
// Fora do escopo (M3): só quando a frase PEDE a coisa ("vendem carro", "tem dentista"), com o termo
// até 3 palavras depois do verbo; e só passa na frente de intenções genéricas.
const OFFER = "(?:vende|vendem|vender|venda|vendas|tem|teria|tem algum|trabalha|trabalham|faz|fazem|fazer|oferece|oferecem|conserta|consertam|aluga|alugam|atende|atendem|serve|servem|quero|queria|preciso|procuro|compro|comprar|marcar|agendar|contratar)";
const GAP = "(?:um|uma|uns|umas|o|a|os|as|algum|alguma|alguns|algumas|de|do|da|dos|das|com|consultas?|servicos?|atendimento|voces|vcs|ai|aqui)";
const GENERIC_INTENTS = new Set(["sobre_bot", "ajuda", "catalogo_ajuda", "saudacao"]);
const joinOr = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ou ${items.at(-1)}`);
const joinAnd = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Qual opção a pessoa escolheu: texto do botão, parte dele ("o Sol"), posição ("a segunda") ou
 *  "todas" (devolve -2, quando permitido). -1 = não respondeu à pergunta. */
export function pickLabel(labels, text, { todas = false } = {}) {
  const n = normalize(text);
  if (!n || !labels.length) return -1;
  if (todas && ALL.test(n)) return -2;
  const norm = labels.map((l) => normalize(l));
  const exact = norm.indexOf(n);
  if (exact >= 0) return exact;
  if (n.split(" ").length <= 3)
    for (const [pos, names] of Object.entries(ORDINAL))
      if (labels[pos - 1] && names.some((w) => n === w || n === `o ${w}` || n === `a ${w}` || (w.length > 3 && (n.startsWith(w) || n.startsWith(`o ${w}`) || n.startsWith(`a ${w}`))))) return pos - 1;
  const inside = norm.map((l, i) => [l, i]).filter(([l]) => l.length >= 3 && (n.includes(l) || (n.length >= 3 && l.includes(n))));
  if (inside.length === 1) return inside[0][1];
  const words = new Set(tokens(text).filter((w) => w.length > 2));
  const scored = norm
    .map((l, i) => {
      const t = tokens(l).filter((w) => w.length > 2);
      return { i, r: t.length ? t.filter((w) => words.has(w)).length / t.length : 0 };
    })
    .sort((a, b) => b.r - a.r);
  return scored[0] && scored[0].r >= 0.5 && (!scored[1] || scored[1].r < scored[0].r) ? scored[0].i : -1;
}

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
  // Versão 0.9: funcionalidades desligadas no instalador (agente.recursos) ficam fora da vista ativa.
  const { agente, intencoes, faq, paginas, catalogo, fluxos, consultas, setor, conteudos, interacoes, midias, perfil } = activeView(knowledge);
  const perguntasPerfil = perfil.ativo ? perfil.perguntas : [];
  // Fluxos (conversa em etapas) e consultas da conta entram no classificador como intenções.
  const examples = {
    ...Object.fromEntries(Object.entries(intencoes).map(([k, v]) => [k, v.exemplos])),
    ...Object.fromEntries(fluxos.map((f) => [`fluxo__${f.id}`, f.gatilhos])),
    ...Object.fromEntries(consultas.dados.map((d) => [`consulta__${d.id}`, d.exemplos])),
    ...Object.fromEntries(interacoes.filter((x) => x.exemplos.length >= 2 && !SHARED_TYPES.has(x.tipo)).map((x) => [`interacao__${x.id}`, x.exemplos])),
    // Versão 0.8: perguntas sobre os dados da pessoa logada (só com perfil.ativo).
    ...Object.fromEntries(perguntasPerfil.map((q) => [`perfil__${q.id}`, q.exemplos])),
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
    // Versão 0.8: galerias de fotos por etapa/categoria.
    ...midias.galerias.map((g) => ({ id: g.id, tipo: "galeria", principal: `${g.etapa || g.titulo}`, medio: `${g.grupo} ${g.titulo}`, secundario: g.termos, dados: g })),
    // Versão 0.10: vídeos e PDFs (cartões).
    ...midias.videos.map((v) => ({ id: v.id, tipo: "video", principal: v.titulo, medio: v.grupo, secundario: v.termos, dados: v })),
    ...midias.arquivos.map((f) => ({ id: f.id, tipo: "arquivo", principal: f.titulo, medio: f.grupo, secundario: f.termos, dados: f })),
  ], { sinonimos: setor.sinonimos });
  const recursos = knowledge.agente.recursos;
  // Conversa da vez (frase normalizada e contexto), para as respostas que dependem da memória.
  let now = { n: "", contexto: {} };
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
  // Versão 0.10: campos do formulário que o agente sabe perguntar (captura de contato).
  const fieldsOf = (x) => {
    const c = x.campos.map((f) => normalize(f));
    return {
      nome: c.some((f) => /\b(nome|name|seu nome)\b/.test(f) && !/empresa|fantasia|social|usuario/.test(f)),
      email: c.some((f) => /e-?mail/.test(f)),
      telefone: c.some((f) => /(telefone|celular|whats|fone|phone|\btel\b)/.test(f)),
      mensagem: c.some((f) => /(mensagem|message|duvida|descri|detalhe|observ|comentario|assunto|como podemos)/.test(f)),
    };
  };
  const canFill = (x) => {
    if (!x || recursos.preencher === false || x.requerLogin || !LEAD_TYPES.has(x.tipo) || /^https?:/i.test(x.link)) return false;
    const f = fieldsOf(x);
    return f.email || f.telefone;
  };
  // Interação: para que serve, o que pedir e o botão que leva até a parte do site que faz aquilo.
  // Versão 0.10: com login, confirma antes de levar (M5); com formulário de contato, oferece
  // preencher junto (M6).
  const answerInteraction = (x, { confirmado = false } = {}) => {
    const login = x.requerLogin && consultas.login && consultas.login !== x.link;
    if (login && !confirmado)
      return {
        texto: `${x.resumo.replace(/\s*É preciso entrar na sua conta\.?/, "")} Para isso você precisa entrar na sua conta. Quer que eu te leve até lá?`,
        sugestoes: ["Sim, vamos", "Agora não"],
        fonte: x.id,
        contexto: { confirmar: x.id },
      };
    const fill = canFill(x);
    return {
      texto: `${x.resumo} Te levo até lá:${fill ? " Se preferir, eu pego seus dados aqui e deixo o formulário preenchido para você conferir e enviar." : ""}`,
      acoes: [
        { rotulo: (/^https?:/i.test(x.link) ? x.titulo || "Abrir" : `Ir para ${x.titulo}`).slice(0, 60), href: x.link },
        ...(login ? [{ rotulo: "Entrar na conta", href: consultas.login }] : []),
      ],
      ...(fill ? { sugestoes: ["Preencher comigo"], contexto: { oferta: x.id } } : {}),
      fonte: x.id,
    };
  };
  // Conteúdo: introdução curta (resumo extraído do próprio texto) e o link para o original.
  const answerContent = (c) => ({
    texto: `Resumindo "${c.titulo}": ${c.resumo}${c.link ? " O texto completo está no link abaixo." : ""}`,
    acoes: c.link ? [{ rotulo: "Ler o conteúdo completo", href: c.link }] : [],
    // Versão 0.10: resposta curta primeiro; "Explicar melhor" mostra o resumo maior.
    ...(c.detalhe ? { sugestoes: ["Explicar melhor"] } : {}),
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
    ({ faq: answerFaq, pagina: answerPage, glossario: answerGlossary, conteudo: answerContent, interacao: (x) => answerInteraction(x), galeria: (g) => galleryWithMemory(g, {}), video: (v) => answerCards([v], "video"), arquivo: (f) => answerCards([f], "arquivo") })[doc.tipo]?.(doc.dados) || answerPage(doc.dados);
  // Rótulo curto para "Você quis dizer...?" a partir de uma intenção candidata.
  const labelFor = (name) => {
    if (name.startsWith("interacao__")) return interactionById(name.slice(11))?.titulo;
    if (name.startsWith("fluxo__")) return flowById(name.slice(7))?.gatilhos[0];
    if (name.startsWith("consulta__")) return consultas.dados.find((d) => d.id === name.slice(10))?.exemplos[0];
    if (name.startsWith("perfil__")) return profileById(name.slice(8))?.exemplos[0];
    return intencoes[name]?.exemplos.find((e) => e.split(" ").length >= 2) || intencoes[name]?.exemplos[0];
  };

  // ---- Versão 0.8: fotos (galerias) e dados da pessoa logada ----
  const fmtDay = (iso) => {
    const d = new Date(`${iso}T12:00:00`);
    return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat(agente.idioma || "pt-BR", { dateStyle: "short" }).format(d);
  };
  const galleryById = (id) => midias.galerias.find((g) => g.id === id);
  const manyGroups = new Set(midias.galerias.map((g) => g.grupo)).size > 1;
  const userGroups = (usuario, campo) => {
    if (!usuario) return [];
    const v = campo ? valueAt(usuario, campo, perfil.apelidos) : undefined;
    if (v != null) return [normalize(String(v))];
    // Sem campo indicado: qualquer texto dos dados que seja o nome de um grupo de galerias.
    const values = [];
    const walk = (o, d) => {
      if (!o || typeof o !== "object" || d > 3) return;
      for (const x of Object.values(o)) typeof x === "string" ? values.push(normalize(x)) : walk(x, d + 1);
    };
    walk(usuario, 0);
    return values.filter((x) => x.length >= 3 && midias.galerias.some((g) => normalize(g.grupo).includes(x) || x.includes(normalize(g.grupo))));
  };
  // Galerias do grupo da pessoa (o empreendimento dela, por exemplo) quando há várias.
  const galleriesFor = (groups) => {
    if (!groups.length) return midias.galerias;
    const own = midias.galerias.filter((g) => groups.some((x) => normalize(g.grupo).includes(x) || x.includes(normalize(g.grupo)) || normalize(g.titulo).includes(x)));
    return own.length ? own : midias.galerias;
  };
  // Galeria com a foto mais recente (ou a última da lista, sem datas).
  const newest = (g) => g.itens.reduce((m, i) => (i.data > m ? i.data : m), "");
  const latestOf = (pool) => pool.reduce((best, g) => (!best || newest(g) >= newest(best) ? g : best), null);
  function findGallery(subject, pool = midias.galerias) {
    const clean = normalize(subject).replace(/\b\d{1,4}(?:[/.-]\d{1,2}){1,2}\b/g, " ").replace(MEDIA_WORDS, " ").replace(/\s+/g, " ").trim();
    // "fotos do Residencial Sol": o grupo citado restringe; sem etapa citada, vale a mais recente.
    const named = clean ? pool.filter((g) => g.grupo && clean.includes(normalize(g.grupo))) : [];
    const scope = named.length ? named : pool;
    const ids = new Set(scope.map((g) => g.id));
    const rest = named.length ? named.reduce((t, g) => t.replace(normalize(g.grupo), " "), clean).trim() : clean;
    if (rest) {
      const hit = index.search(rest, { tipo: "galeria", limit: 30 }).find((h) => ids.has(h.doc.id) && h.hits >= 1 && h.ratio >= 0.34 && (!named.length || normalize(h.doc.dados.etapa || h.doc.dados.titulo).split(" ").some((w) => w.length > 2 && rest.includes(w))));
      if (hit) return hit.doc.dados;
    }
    if (named.length) return latestOf(named);
    return scope.length === 1 ? scope[0] : null;
  }
  // Foto no chat + botão para a página com todas as fotos daquela etapa.
  function answerGallery(g, req = {}, intro = "") {
    const sorted = [...g.itens].sort((a, b) => (a.data && b.data ? (a.data < b.data ? -1 : a.data > b.data ? 1 : 0) : a.ordem - b.ordem));
    const photo = Number.isInteger(req.indice) ? sorted[Math.max(0, Math.min(sorted.length - 1, req.indice))] : pickPhoto(g, req);
    const pos = sorted.indexOf(photo);
    const qual = Number.isInteger(req.indice) ? "esta é a foto" : req.data ? "a foto mais próxima dessa data" : req.modo === "primeira" ? "a primeira foto" : "a foto mais recente";
    const quando = photo.data ? `, publicada em ${fmtDay(photo.data)}` : "";
    const head = intro ? `${intro} ` : "";
    const siblings = midias.galerias.filter((x) => x.id !== g.id && x.grupo === g.grupo).slice(0, 3);
    return {
      texto: `${head}${qual.charAt(0).toUpperCase()}${qual.slice(1)} de ${manyGroups ? g.titulo : g.etapa || g.titulo}${quando}${photo.legenda ? `: ${photo.legenda}` : ""}.`,
      imagens: [{ src: photo.src, legenda: photo.legenda || g.titulo, data: photo.data }],
      acoes: g.link ? [{ rotulo: `Ver todas as fotos de ${g.etapa || g.grupo}`.slice(0, 60), href: g.link }] : [],
      sugestoes: [...(pos > 0 ? ["Foto anterior"] : []), ...siblings.map((x) => `Fotos de ${x.etapa || x.titulo}`.slice(0, 60))].slice(0, 4),
      fonte: g.id,
      // Versão 0.10: lembra o empreendimento/lugar escolhido para as próximas perguntas.
      contexto: { galeria: g.id, foto: pos, ...(manyGroups && g.grupo ? { grupo: g.grupo } : {}) },
    };
  }
  // ---- Versão 0.10 (M1): pergunta de esclarecimento por lacuna ----
  const stageKey = (g) => normalize(g.etapa || g.titulo);
  // A mesma etapa existe em mais de um lugar ("Áreas de lazer" no Sol e no Parque Verde): usa o
  // lugar lembrado da conversa; sem ele, pergunta "De qual?" e guarda a resposta.
  function galleryWithMemory(g, req, pool = midias.galerias) {
    if (!manyGroups) return answerGallery(g, req);
    const twins = pool.filter((x) => stageKey(x) === stageKey(g));
    const groups = [...new Set(twins.map((x) => x.grupo).filter(Boolean))];
    if (groups.length < 2) return answerGallery(g, req);
    const lembrado = typeof now.contexto?.grupo === "string" && twins.find((x) => x.grupo === now.contexto.grupo);
    if (lembrado) return answerGallery(lembrado, req);
    return askWhich("galeria", groups, `Tenho fotos de ${g.etapa || g.titulo} em ${groups.length} lugares: ${joinOr(groups)}. De qual você quer ver?`, { etapa: stageKey(g), campo: "grupo", modo: req.modo || "", data: req.data || "" });
  }
  const askWhich = (tipo, opcoes, texto, extra = {}, sugestoes = opcoes) => ({
    texto,
    sugestoes: sugestoes.slice(0, 4).map((x) => String(x).slice(0, 60)),
    esclarecer: true,
    contexto: { esclarecer: { tipo, opcoes: opcoes.slice(0, 8).map((x) => String(x).slice(0, 80)), ...extra } },
  });
  // Resposta à pergunta "De qual?": escolhe e responde; -1 = a pessoa mudou de assunto.
  function resolveWhich(esc, text, usuario) {
    const i = pickLabel(esc.opcoes, text, { todas: Boolean(esc.todas) });
    if (i === -1) return null;
    if (esc.tipo === "galeria") {
      const value = esc.opcoes[i];
      const cands = midias.galerias.filter((x) => (esc.campo === "etapa" ? stageKey(x) === normalize(value) : x.grupo === value && (!esc.etapa || stageKey(x) === esc.etapa)));
      const g = esc.etapa || esc.campo === "etapa" ? cands[0] : latestOf(cands);
      return g ? { r: answerGallery(g, { modo: esc.modo || "ultima", data: esc.data || "" }), intencao: "galeria" } : null;
    }
    if (esc.tipo === "perfil") {
      const q = profileById(esc.id);
      return q ? { r: answerProfile(q, usuario, i === -2 ? { todas: true } : { item: i }), intencao: `perfil__${q.id}` } : null;
    }
    if (esc.tipo === "lead") {
      const x = interactionById(esc.opcoes[i] && esc.ids?.[i]);
      return x ? { r: startLead(x), intencao: "lead_nome" } : null;
    }
    return null;
  }
  function answerMedia(text, n, contexto, usuario) {
    if (!midias.galerias.length) return null;
    // Continuação: "a anterior", "a próxima", "a primeira" sobre a galeria da resposta anterior.
    const last = typeof contexto?.galeria === "string" && galleryById(contexto.galeria);
    if (last && Number.isInteger(contexto.foto) && n.split(" ").length <= 5) {
      if (/\b(anterior|antes|previa)\b/.test(n)) return answerGallery(last, { indice: contexto.foto - 1 });
      if (/\b(proxima|seguinte|depois)\b/.test(n)) return answerGallery(last, { indice: contexto.foto + 1 });
      if (/\b(primeir[ao]|mais antig[ao])\b/.test(n)) return answerGallery(last, { modo: "primeira" });
    }
    if (!MEDIA.test(n)) return null;
    const own = OWN.test(n);
    const pool = own ? galleriesFor(userGroups(usuario)) : midias.galerias;
    const g = findGallery(text, pool);
    const named = pool.some((x) => x.grupo && n.includes(normalize(x.grupo)));
    if (g) return named || own ? answerGallery(g, photoRequest(n)) : galleryWithMemory(g, photoRequest(n), pool);
    // Vários grupos (empreendimentos, imóveis, destinos...): pergunta qual; um só: qual etapa.
    // Versão 0.10: com um lugar já escolhido na conversa, mostra a mais recente de lá.
    const lembrado = manyGroups && typeof contexto?.grupo === "string" ? pool.filter((x) => x.grupo === contexto.grupo) : [];
    if (lembrado.length) return answerGallery(latestOf(lembrado), photoRequest(n));
    const grupos = [...new Set(pool.map((x) => x.grupo).filter(Boolean))];
    const opcoes = grupos.length > 1 ? grupos : [...new Set(pool.map((x) => x.etapa || x.titulo))];
    const pages = [...new Set(pool.map((x) => x.link.split("#")[0]))];
    const req = photoRequest(n);
    return {
      ...askWhich(
        "galeria",
        opcoes,
        grupos.length > 1 ? `Tenho fotos de ${grupos.length} lugares/projetos: ${joinOr(grupos.slice(0, 4))}. De qual você quer ver?` : `Tenho fotos de ${opcoes.length} etapas/categorias. De qual você quer ver?`,
        { campo: grupos.length > 1 ? "grupo" : "etapa", modo: req.modo, data: req.data },
        opcoes.map((x) => `Fotos de ${x}`),
      ),
      acoes: pages.length === 1 ? [{ rotulo: "Ver a galeria", href: pages[0] }] : [],
    };
  }
  // ---- Versão 0.10 (M8): vídeos e PDFs como cartões ----
  const cardOf = (d, tipo) =>
    tipo === "video"
      ? { tipo: "video", titulo: d.titulo, href: d.url, plataforma: d.plataforma, ...(d.link ? { pagina: d.link } : {}) }
      : { tipo: "pdf", titulo: d.titulo, href: d.href, ...(d.link ? { pagina: d.link } : {}) };
  function answerCards(list, tipo, intro = "") {
    const nome = tipo === "video" ? ["o vídeo", "vídeos"] : ["o arquivo", "arquivos em PDF"];
    const one = list.length === 1;
    return {
      texto: intro || (one ? `Achei ${nome[0]} "${list[0].titulo}"${list[0].grupo ? ` (${list[0].grupo})` : ""}:` : `Achei ${list.length} ${nome[1]}:`),
      cartoes: list.slice(0, 4).map((d) => cardOf(d, tipo)),
      fonte: one ? list[0].id : undefined,
    };
  }
  function answerVideoOrFile(n) {
    // "O que é memorial descritivo?" é pedido de definição (glossário), não do arquivo.
    if (DEFINE.test(n) || EXPLAIN.test(n)) return null;
    for (const [tipo, re, pool] of [["video", VIDEO, midias.videos], ["arquivo", FILE, midias.arquivos]]) {
      if (!pool.length || !re.test(n)) continue;
      const subject = n.replace(CARD_WORDS, " ").replace(/\s+/g, " ").trim();
      const hits = subject ? index.search(subject, { tipo, limit: 4 }).filter((h) => h.hits >= 1 && h.ratio >= 0.34) : [];
      if (hits.length) return answerCards(hits.map((h) => h.doc.dados), tipo);
      // "tem vídeo?", "tem pdf?": mostra o que há. Assunto sem resultado ("cardápio" sem PDF de
      // cardápio): deixa a base responder.
      // "link para download" pode ser o app: lista PDFs só quando a pessoa fala em PDF.
      const generic = tipo === "video" || /\bpdfs?\b/.test(n);
      if (!generic) continue;
      const intro = subject && tipo === "video" ? `Não achei um vídeo só sobre isso. ${pool.length === 1 ? "Este é o vídeo do site:" : "Estes são os vídeos do site:"}` : "";
      return answerCards(pool.slice(0, 3), tipo, intro);
    }
    return null;
  }
  const profileById = (id) => perguntasPerfil.find((q) => q.id === id);
  const loginAction = () => (consultas.login ? [{ rotulo: "Entrar na conta", href: consultas.login }] : []);
  // ---- Versão 0.10 (M9): perfil com listas (várias unidades, vários pedidos) ----
  const withoutArrays = (o, d = 0) => {
    if (!o || typeof o !== "object" || d > 4) return o;
    return Object.fromEntries(Object.entries(o).filter(([, v]) => !Array.isArray(v)).map(([k, v]) => [k, v && typeof v === "object" ? withoutArrays(v, d + 1) : v]));
  };
  const scalarsOf = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v == null || typeof v !== "object"));
  function listsIn(o) {
    const out = [];
    const walk = (x, d) => {
      if (!x || typeof x !== "object" || d > 3) return;
      for (const [k, v] of Object.entries(x)) {
        if (Array.isArray(v)) {
          const objs = v.filter((i) => i && typeof i === "object" && !Array.isArray(i));
          if (objs.length >= 2) out.push({ chave: k, itens: objs.slice(0, 10) });
        } else if (v && typeof v === "object") walk(v, d + 1);
      }
    };
    walk(o, 0);
    return out;
  }
  const fillOpts = () => ({ apelidos: perfil.apelidos, idioma: agente.idioma });
  // A lista que responde a pergunta: com um item da lista, o molde fecha melhor que sem ela.
  function profileList(q, usuario) {
    const lists = listsIn(usuario);
    if (!lists.length) return null;
    const base = fillTemplate(q.resposta, withoutArrays(usuario), fillOpts()).faltando.length;
    return lists.find((l) => fillTemplate(q.resposta, { ...scalarsOf(usuario), ...l.itens[0] }, fillOpts()).faltando.length < base) || null;
  }
  const placeholders = (q) => [...q.resposta.matchAll(/\{([\w.]{1,60})\}/g)].map((m) => m[1]);
  // Rótulo de um item: os dois primeiros campos do molde ("1203 – Residencial Sol").
  const itemLabel = (q, item, i) => {
    const vals = placeholders(q)
      .map((c) => valueAt(item, c, perfil.apelidos))
      .filter((v) => v != null && v !== "" && String(v).length <= 40);
    return [...new Set(vals.map(String))].slice(0, 2).join(" – ") || `Item ${i + 1}`;
  };
  // Item citado na frase ("e o do Parque Verde?", "a unidade 504").
  const itemMentioned = (q, itens, n) => {
    const found = itens
      .map((it, i) => ({ i, vals: placeholders(q).map((c) => valueAt(it, c, perfil.apelidos)).filter((v) => v != null).map((v) => normalize(String(v))).filter((v) => v.length >= 3 || /^\d{2,}$/.test(v)) }))
      .filter((x) => x.vals.some((v) => new RegExp(`(^|\\W)${escapeRe(v)}(\\W|$)`).test(n)));
    return found.length === 1 ? found[0].i : -1;
  };
  const nounOf = (chave) => {
    const k = normalize(chave).replace(/[^a-z]/g, " ").trim();
    return !k || ["data", "items", "itens", "results", "resultados", "rows", "lista"].includes(k) ? "registros" : k;
  };

  /** Resposta sobre os dados da pessoa logada; sem dados → pede login (o widget tenta antes).
   *  sel (0.10): { item: índice na lista, todas: true } quando a pessoa tem vários itens. */
  function answerProfile(q, usuario, sel = {}) {
    const page = perfil.pagina ? [{ rotulo: "Ver minha conta", href: perfil.pagina }] : [];
    const choice = { ...(Number.isInteger(sel.item) ? { item: sel.item } : {}), ...(sel.todas ? { todas: true } : {}) };
    if (!usuario || typeof usuario !== "object")
      return { texto: `Para ver ${q.rotulo}, entre na sua conta. Depois é só me perguntar de novo.`, acoes: loginAction().length ? loginAction() : page, perfil: { id: q.id, ...choice }, precisaLogin: true };
    const lista = profileList(q, usuario);
    if (lista) {
      const labels = lista.itens.map((it, i) => itemLabel(q, it, i));
      const merged = (it) => ({ ...scalarsOf(usuario), ...it });
      if (sel.todas) {
        const parts = lista.itens.map((it, i) => `${labels[i]}: ${answerProfileOne(q, { ...merged(it), nome: undefined }, page).texto}`);
        return { texto: `${firstName(usuario) && agente.tom !== "neutro" ? `${firstName(usuario)}, aqui estão` : "Aqui estão"} ${q.rotulo} (${lista.itens.length} ${nounOf(lista.chave)}). ${parts.join(" ")}`, acoes: [...q.acoes, ...page].slice(0, 4), perfil: { id: q.id, todas: true } };
      }
      const lembrado = now.contexto?.perfilItem?.chave === lista.chave ? now.contexto.perfilItem.indice : -1;
      const citado = itemMentioned(q, lista.itens, now.n);
      const idx = Number.isInteger(sel.item) ? sel.item : citado >= 0 ? citado : lembrado;
      if (!lista.itens[idx])
        return { ...askWhich("perfil", labels, `Você tem ${lista.itens.length} ${nounOf(lista.chave)}: ${joinOr(labels.slice(0, 4))}. De qual quer saber ${q.rotulo}?`, { id: q.id, todas: true }, [...labels.slice(0, 3), "Todas"]), perfil: { id: q.id } };
      const r = answerProfileOne(q, merged(lista.itens[idx]), page);
      return { ...r, perfil: { id: q.id, item: idx }, contexto: { ...(r.contexto || {}), perfilItem: { chave: lista.chave, indice: idx } } };
    }
    return answerProfileOne(q, usuario, page);
  }
  function answerProfileOne(q, usuario, page) {
    const r = fillTemplate(q.resposta, usuario, { apelidos: perfil.apelidos, idioma: agente.idioma });
    if (r.faltando.length) return { texto: `Não encontrei ${q.rotulo} nos dados da sua conta.${page.length ? " Você pode conferir direto na página:" : ""}`, acoes: page, perfil: { id: q.id } };
    const nome = firstName(usuario);
    let out = { texto: `${nome && agente.tom !== "neutro" ? `${nome}, ` : ""}${nome && agente.tom !== "neutro" ? r.texto.charAt(0).toLowerCase() + r.texto.slice(1) : r.texto}`, acoes: [...q.acoes, ...page].slice(0, 4), perfil: { id: q.id } };
    if (q.midia && midias.galerias.length) {
      const subject = fillTemplate(q.midia, usuario, { apelidos: perfil.apelidos }).texto;
      const pool = galleriesFor(userGroups(usuario, q.grupo));
      const g = findGallery(subject, pool) || (pool !== midias.galerias && pool.length ? latestOf(pool) : null);
      if (g) {
        const photo = answerGallery(g, { modo: "ultima" });
        out = { ...out, texto: `${out.texto} ${photo.texto}`, imagens: photo.imagens, acoes: [...photo.acoes, ...out.acoes].slice(0, 4), sugestoes: photo.sugestoes, contexto: photo.contexto };
      }
    }
    return out;
  }

  // ---- Versão 0.10 (M6): captura de contato conversacional ----
  // Nome e e-mail/telefone perguntados um a um, conferidos e colocados no formulário do PRÓPRIO
  // site (o widget preenche; a pessoa confere e envia). Nada é enviado nem guardado no servidor.
  const fillable = () => interacoes.filter(canFill);
  const LEAD_ORDER = ["orcamento", "contato", "agendamento", "reserva", "inscricao", "suporte", "parceria", "newsletter"];
  const leadSteps = (x) => {
    const f = fieldsOf(x);
    return [...(f.nome ? ["nome"] : []), "contato", ...(f.mensagem ? ["mensagem"] : [])];
  };
  function askLead(x, lead) {
    const f = fieldsOf(x);
    const nome = lead.dados.nome ? lead.dados.nome.split(" ")[0] : "";
    const textos = {
      nome: `Combinado! Vou separar os dados para "${x.titulo}". Qual é o seu nome?`,
      contato: `${nome ? `Obrigado, ${nome}! ` : "Combinado! "}Qual ${f.email && f.telefone ? "e-mail ou telefone (com DDD)" : f.email ? "e-mail" : "telefone (com DDD)"} a equipe pode usar para responder?`,
      mensagem: `Quer deixar uma mensagem para a equipe? Escreva em poucas palavras ou diga "pular".`,
    };
    return { texto: textos[lead.passo], sugestoes: lead.passo === "mensagem" ? ["Pular", "Cancelar"] : ["Cancelar"], contexto: { lead } };
  }
  function startLead(x) {
    return askLead(x, { id: x.id, passo: leadSteps(x)[0], dados: {} });
  }
  // Escolhe o formulário: o citado na frase, o da oferta, ou o mais provável (orçamento, contato...).
  function leadFor(n) {
    const list = fillable();
    if (!list.length) return null;
    const cited = list.filter((x) => n.includes(normalize(x.tipo)) || (x.titulo && n.includes(normalize(x.titulo))));
    const pool = cited.length ? cited : list;
    return [...pool].sort((a, b) => LEAD_ORDER.indexOf(a.tipo) - LEAD_ORDER.indexOf(b.tipo))[0];
  }
  const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
  function leadStep(lead, text, n) {
    const x = interactionById(lead.id);
    if (!x) return null;
    if (CANCEL.test(n)) return { r: { texto: "Tudo bem, cancelei. Nada foi enviado nem guardado.", sugestoes: defaultChips() }, intencao: "lead_cancelado" };
    // Pergunta no meio do caminho: responde normalmente (a captura fica para depois).
    if (lead.passo !== "mensagem" && QUESTION_LIKE.test(n) && !EMAIL.test(text)) return null;
    const dados = { ...lead.dados };
    const f = fieldsOf(x);
    if (lead.passo === "nome") {
      const nome = text.trim().replace(/^(meu nome (é|e)|me chamo|eu sou( o| a)?|sou( o| a)?|é|e)\s+/i, "").replace(/[.!]+$/, "").trim();
      if (!/^[\p{L}][\p{L}' .-]{1,79}$/u.test(nome) || nome.split(/\s+/).length > 6)
        return { r: { texto: "Não peguei o nome. Pode escrever só o seu nome?", sugestoes: ["Cancelar"], contexto: { lead } }, intencao: "lead_nome" };
      dados.nome = nome.replace(/\s+/g, " ");
    } else if (lead.passo === "contato") {
      const email = f.email && text.match(EMAIL)?.[0];
      const digits = text.replace(/\D/g, "");
      const phone = f.telefone && digits.length >= 10 && digits.length <= 13 ? digits : "";
      if (!email && !phone) {
        const pede = f.email && f.telefone ? "um e-mail (nome@email.com) ou um telefone com DDD" : f.email ? "um e-mail (nome@email.com)" : "um telefone com DDD, como (11) 98888-7777";
        return { r: { texto: `Não parece ${pede}. Pode conferir?`, sugestoes: ["Cancelar"], contexto: { lead } }, intencao: "lead_contato" };
      }
      if (email) dados.email = email.toLowerCase();
      if (phone) dados.telefone = phone.length === 11 ? `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}` : phone.length === 10 ? `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}` : phone;
    } else if (lead.passo === "mensagem" && !/^(pular|pula|nao|sem mensagem|nada)\b/.test(n)) dados.mensagem = text.trim().slice(0, 500);
    const steps = leadSteps(x);
    const next = steps[steps.indexOf(lead.passo) + 1];
    if (next) return { r: askLead(x, { ...lead, passo: next, dados }), intencao: `lead_${next}` };
    const nome = dados.nome ? dados.nome.split(" ")[0] : "";
    const resumo = [dados.nome && `nome ${dados.nome}`, dados.email && `e-mail ${dados.email}`, dados.telefone && `telefone ${dados.telefone}`].filter(Boolean);
    return {
      r: {
        texto: `Pronto${nome ? `, ${nome}` : ""}! Separei ${joinAnd(resumo)} para o formulário "${x.titulo}". Abra a página, confira os campos e clique em enviar: eu não envio nada sozinho.`,
        acoes: [{ rotulo: "Abrir o formulário preenchido", href: x.link }],
        formulario: { pagina: x.link, valores: dados },
      },
      intencao: "lead_pronto",
    };
  }

  // ---- Versão 0.10 (M7): resposta curta/detalhada ----
  function answerMore(id) {
    const contato = intencoes.contato?.acoes || [];
    const c = conteudos.find((x) => x.id === id);
    const relatedContent = (q) => index.search(q, { tipo: "conteudo", limit: 3 }).find((h) => h.doc.id !== id && strong(h))?.doc.dados;
    const longer = (cc) =>
      cc.detalhe
        ? { texto: `Em mais detalhes, sobre "${cc.titulo}": ${cc.detalhe}`, acoes: cc.link ? [{ rotulo: "Ler o conteúdo completo", href: cc.link }] : [], fonte: cc.id }
        : { texto: `Esse é o principal de "${cc.titulo}".${cc.link ? " O texto completo, com todos os detalhes, está no link:" : ""}`, acoes: cc.link ? [{ rotulo: "Ler o conteúdo completo", href: cc.link }] : contato, fonte: cc.id };
    if (c) return longer(c);
    const f = faq.find((x) => x.id === id);
    const g = setor.glossario.find((x) => x.id === id);
    const x = interactionById(id);
    if (x) return { texto: `${x.resumo}${x.campos.length ? ` Os campos do formulário são: ${joinAnd(x.campos.slice(0, 6))}.` : ""}`, acoes: [{ rotulo: `Ir para ${x.titulo}`.slice(0, 60), href: x.link }], fonte: x.id };
    const topic = f ? `${f.pergunta} ${f.termos}` : g ? `${g.termo} ${g.sinonimos.join(" ")}` : "";
    const rc = topic && relatedContent(topic);
    if (rc) return longer(rc);
    if (f?.link) return { texto: "A explicação completa está nesta página:", acoes: [{ rotulo: "Saiba mais", href: f.link }], fonte: f.id };
    if (f || g) return { texto: `Essa é toda a informação que eu tenho sobre isso.${contato.length ? " A equipe pode explicar melhor:" : ""}`, acoes: contato, fonte: id };
    return null;
  }

  // ---- Versão 0.10 (M3): fora do escopo do setor ----
  const foraRe = setor.fora.map((f) => ({ f, re: f.termos.map((t) => ({ t, re: new RegExp(`\\b${OFFER}\\b(?:\\s+${GAP}){0,3}\\s+${escapeRe(normalize(t)).replace(/ /g, "[\\s-]+")}`) })) }));
  function outOfScope(n) {
    for (const { f, re } of foraRe)
      for (const { t, re: r } of re)
        if (r.test(n) && !index.knows(t)) return { f, t };
    return null;
  }

  function answerIntent(name, turn, usuario) {
    if (name.startsWith("perfil__")) return answerProfile(profileById(name.slice(8)), usuario);
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
  // opcoes.usuario (0.8): dados da pessoa logada entregues pelo site (só no navegador/servidor do site).
  function replyOne(mensagem, contexto = {}, { usuario = null } = {}) {
    const text = String(mensagem ?? "").slice(0, 500);
    const turn = Number.isInteger(contexto?.voltas) && contexto.voltas >= 0 ? contexto.voltas : 0;
    const done = (r, intencao, confianca = 1) => ({
      texto: r.texto,

      acoes: r.acoes || [],
      itens: r.itens || [],
      sugestoes: r.sugestoes || [],
      // Pergunta "De qual?" sobre fotos tem sempre o mesmo nome de intenção (0.8).
      intencao: r.esclarecer && intencao === "galeria" ? "galeria_escolher" : intencao,
      confianca: Math.round(confianca * 100) / 100,
      ...(r.fonte ? { fonte: r.fonte } : {}),
      ...(r.consulta ? { consulta: r.consulta } : {}),
      ...(r.imagens?.length ? { imagens: r.imagens } : {}),
      ...(r.perfil ? { perfil: r.perfil } : {}),
      ...(r.cartoes?.length ? { cartoes: r.cartoes } : {}),
      ...(r.formulario ? { formulario: r.formulario } : {}),
      // Versão 0.10: memória da conversa (lugar escolhido, item da lista, última resposta).
      contexto: {
        voltas: turn + 1,
        ...(typeof contexto?.grupo === "string" ? { grupo: contexto.grupo } : {}),
        ...(contexto?.perfilItem ? { perfilItem: contexto.perfilItem } : {}),
        ...(r.fonte ? { ultimo: r.fonte } : {}),
        ...(r.contexto || {}),
      },
    });
    const n = normalize(text);
    now = { n, contexto: contexto || {} };
    if (!n) return done({ texto: agente.vazio }, "vazio", 0);

    // ---- Versão 0.10: a conversa guiada vem antes de tudo ----
    // Captura de contato em andamento (nome → e-mail/telefone → mensagem).
    if (contexto?.lead && typeof contexto.lead.id === "string") {
      const step = leadStep(contexto.lead, text, n);
      if (step) return done(step.r, step.intencao, 1);
    }
    // Resposta à pergunta "De qual?" (lugar, unidade, pedido).
    if (contexto?.esclarecer && Array.isArray(contexto.esclarecer.opcoes)) {
      const picked = resolveWhich(contexto.esclarecer, text, usuario);
      if (picked) return done(picked.r, picked.intencao, 1);
    }
    // Confirmação antes de levar a uma área com login.
    if (typeof contexto?.confirmar === "string" && interactionById(contexto.confirmar)) {
      if (YES.test(n)) return done(answerInteraction(interactionById(contexto.confirmar), { confirmado: true }), "interacao", 1);
      if (NO.test(n)) return done({ texto: "Tudo bem! Quando quiser, é só pedir.", sugestoes: defaultChips() }, "confirmacao_nao", 1);
    }
    // Oferta de preencher o formulário junto.
    if (typeof contexto?.oferta === "string" && canFill(interactionById(contexto.oferta))) {
      if (YES.test(n)) return done(startLead(interactionById(contexto.oferta)), "lead_inicio", 1);
      if (NO.test(n)) return done({ texto: "Tudo bem! O link do formulário está logo acima.", sugestoes: defaultChips() }, "confirmacao_nao", 1);
    }
    // "Explica melhor": a versão longa da última resposta.
    if (typeof contexto?.ultimo === "string" && EXPLAIN_MORE.test(n) && n.split(" ").length <= 6) {
      const more = answerMore(contexto.ultimo);
      if (more) return done(more, "detalhe", 1);
    }
    // "Me liguem", "quero deixar meu contato": captura com o formulário certo do site.
    if (LEAD.test(n) && !DEFINE.test(n)) {
      const x = leadFor(n);
      if (x) return done(startLead(x), "lead_inicio", 0.9);
    }

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

    // Versão 0.8: fotos ("última foto da área de lazer") e continuação ("a anterior").
    // Pergunta de perfil com foto ("fotos da minha obra") fica com o perfil, que sabe qual obra.
    const ranked0 = model && OWN.test(n) && perguntasPerfil.length ? classify(model, text)[0] : null;
    const ownProfile = ranked0 && ranked0.intent.startsWith("perfil__") && ranked0.p >= agente.limiar;
    // Versão 0.10: vídeos e PDFs viram cartões ("vídeo da obra", "memorial descritivo em pdf").
    const cards = !ownProfile && answerVideoOrFile(n);
    if (cards) return done(cards, "cartoes", 0.9);
    const media = !ownProfile && answerMedia(text, n, contexto, usuario);
    if (media) return done(media, media.imagens ? "galeria" : "galeria_escolher", media.imagens ? 0.9 : 0.6);

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
    // Versão 0.10 (M3): "vocês vendem carro?" numa clínica: diz que não é com a gente, em vez de
    // chutar uma página parecida ou responder "sobre o assistente".
    const fora = setor.fora.length && !itemHit && !strong(best) && (!confident || GENERIC_INTENTS.has(top.intent)) && outOfScope(n);
    if (fora)
      return done({ texto: `Isso não é algo que ${agente.site} oferece: aqui o assunto é ${setor.nome.replace(/\s*\(.*\)/, "").toLowerCase()}. Posso ajudar com outra coisa?`, sugestoes: defaultChips(), acoes: [] }, "fora_do_escopo", 0.8);
    const intentFirst = confident && (!strong(best) || (top.p >= 0.9 && words <= 3)) && !(asksCatalog && words > 3) && !itemHit;
    if (intentFirst || (confident && /^(fluxo|consulta|perfil)__/.test(top.intent) && !itemHit)) return done(answerIntent(top.intent, turn, usuario), top.intent, top.p);
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
        return done(answerIntent(top.intent, turn, usuario), top.intent, top.p);
      // Página que é a porta de uma interação: a interação explica para que serve antes do link.
      const viaInteraction = chosen.doc.tipo === "pagina" && !wantsPage && hits.find((h) => h.doc.tipo === "interacao" && h.doc.dados.link === chosen.doc.dados.href && weak(h));
      const final = viaInteraction || chosen;
      return done(answerDoc(final.doc), final.doc.tipo, final.ratio);
    }
    if (asksCatalog) {
      const r = answerCatalog(text);
      if (r) return done(r, "catalogo", hits[0]?.ratio || 0.5);
    }
    if (confident) return done(answerIntent(top.intent, turn, usuario), top.intent, top.p);
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

  // ---- Versão 0.8: camada de conversa (mais natural, sem IA) ----
  const MISS = new Set(["nao_entendi", "voce_quis_dizer", "vazio", "mais_sem_contexto", "nenhuma_opcao", "galeria_escolher", "fora_do_escopo"]);
  const isAnswer = (r) => !MISS.has(r.intencao) && !String(r.intencao).endsWith("-provavel") && r.confianca >= 0.5;
  // Perguntas relacionadas (como os assistentes de IA sugerem): outras FAQs perto do assunto.
  const related = (r) => {
    const f = r.fonte && faq.find((x) => x.id === r.fonte);
    if (!f) return [];
    return index
      .search(`${f.pergunta} ${f.termos}`, { tipo: "faq", limit: 5 })
      .filter((h) => h.doc.id !== f.id && h.hits >= 2 && h.ratio >= 0.3)
      .slice(0, 2)
      .map((h) => h.doc.dados.pergunta.slice(0, 60));
  };
  /** Divide "qual o horário e vocês aceitam pix?" em partes (até 3) com 2+ palavras cada. */
  function splitQuestions(text) {
    const parts = String(text).split(SPLIT).map((p) => p && p.trim().replace(/^[,;.\s]+|[,;\s]+$/g, "")).filter((p) => p && tokens(p).length >= 2);
    return parts.length >= 2 && parts.length <= 3 ? parts : null;
  }
  function reply(mensagem, contexto = {}, opcoes = {}) {
    const text = String(mensagem ?? "").slice(0, 500);
    const n = normalize(text);
    let r = null;
    // Mais de uma pergunta na mesma frase: responde cada uma, na ordem, com o assunto citado.
    const guided = (typeof contexto?.fluxo === "string" && contexto.fluxo) || contexto?.lead || contexto?.esclarecer;
    const parts = !guided && splitQuestions(text);
    if (parts) {
      const answers = parts.map((p) => replyOne(p, contexto, opcoes));
      const distinct = new Set(answers.map((a) => a.fonte || a.intencao)).size === answers.length;
      if (answers.every(isAnswer) && distinct) {
        const acoes = [];
        // Botões iguais ("Saiba mais") ganham o assunto de cada pergunta.
        answers.forEach((x, i) => {
          for (const a of x.acoes) {
            if (acoes.some((b) => b.href === a.href) || acoes.length >= 4) continue;
            const dup = answers.some((y, j) => j !== i && y.acoes.some((b) => b.rotulo === a.rotulo));
            const topic = parts[i].replace(/[?!.]+$/, "").replace(/^(qual|quais|como|onde|quando|quanto|voc[eê]s|vcs|o que)\s+(e\s+|é\s+|o\s+|a\s+|os\s+|as\s+)?/i, "");
            acoes.push(dup ? { ...a, rotulo: `${a.rotulo}: ${topic}`.slice(0, 60) } : a);
          }
        });
        const last = answers[answers.length - 1];
        r = {
          ...last,
          texto: answers.map((a, i) => `${i === 0 ? "Sobre" : "E sobre"} “${parts[i].replace(/[?!.]+$/, "")}”: ${a.texto}`).join(" "),
          acoes,
          itens: answers.find((a) => a.itens.length)?.itens || [],
          sugestoes: [...new Set(answers.flatMap((a) => a.sugestoes))].slice(0, 4),
          intencao: "multipla",
          confianca: Math.min(...answers.map((a) => a.confianca)),
          partes: answers.map((a) => a.intencao),
          ...(answers.find((a) => a.imagens) ? { imagens: answers.find((a) => a.imagens).imagens } : {}),
        };
        delete r.fonte;
      }
    }
    r ||= replyOne(text, contexto, opcoes);
    // Tom e variação: abre algumas respostas de conteúdo com uma frase curta, sem repetir a
    // anterior (a volta da conversa escolhe), e sugere perguntas relacionadas.
    if (["faq", "conteudo", "glossario", "interacao"].includes(r.intencao)) {
      const list = OPENERS[agente.tom] || OPENERS.neutro;
      const turn = Number.isInteger(contexto?.voltas) ? contexto.voltas : 0;
      const opener = list[turn % list.length];
      if (opener && !/^(sim|nao|não|claro|certo)\b/i.test(r.texto)) r = { ...r, texto: `${opener}${r.texto}` };
      if (!r.sugestoes.length && r.intencao === "faq") r = { ...r, sugestoes: related(r) };
    }
    // Empatia: frase de frustração ganha acolhimento e o caminho para uma pessoa da equipe.
    if (FRUSTRATION.test(n) && agente.tom !== "neutro") {
      const contato = intencoes.contato?.acoes || [];
      // Sem resposta melhor, a reclamação vai direto para quem resolve (não para "não entendi").
      if (MISS.has(r.intencao) && intencoes.contato)
        r = { ...r, texto: `Quero que isso seja resolvido. ${intencoes.contato.respostas[0]}`, intencao: "acolhimento", confianca: 0.8, sugestoes: defaultChips(), contexto: { voltas: r.contexto.voltas } };
      const acoes = [...r.acoes];
      for (const a of contato) if (!acoes.some((b) => b.href === a.href) && acoes.length < 4) acoes.push(a);
      r = { ...r, texto: `Sinto muito pelo transtorno. ${r.texto}`, acoes, empatia: true };
    }
    return r;
  }

  // Saudação: com os dados do site, chama a pessoa pelo primeiro nome.
  const saudacao = (usuario) => {
    const nome = usuario ? firstName(usuario) : "";
    const texto = nome ? agente.saudacao.replace(/^(oi|olá|ola|bem-vindo|bem-vinda)([!,.]?)\s*/i, "") : agente.saudacao;
    return { texto: nome ? `Oi, ${nome}! ${texto}` : texto, sugestoes: defaultChips() };
  };
  // sel (0.10): { item, todas } quando a pergunta já escolheu um item da lista.
  const perfilReply = (id, usuario, sel = {}) => {
    const q = profileById(id);
    if (!q) return null;
    const r = answerProfile(q, usuario, sel || {});
    return { acoes: [], itens: [], sugestoes: [], ...r, intencao: `perfil__${id}`, confianca: 1 };
  };
  // Versão 0.10 (M2): mensagem proativa da página atual (o widget mostra uma por sessão).
  const samePage = (a, b) => {
    const c = (p) => `/${String(p || "").split(/[?#]/)[0].replace(/^\/+/, "")}`.replace(/\/index\.html?$/i, "/").replace(/\.html?$/i, "").replace(/\/+$/, "") || "/";
    return c(a) === c(b);
  };
  const proativa = (caminho) => {
    if (!agente.proativa) return null;
    const p = (agente.proativas || []).find((x) => samePage(x.pagina, caminho));
    return p ? { texto: p.texto, sugestoes: p.sugestoes, aposSeg: p.aposSeg } : null;
  };
  return { reply, knowledge, problems, saudacao, perfil: perfilReply, proativa, recursos: knowledge.agente.recursos };
}
