// Mapa de interações do site (versão 0.7): o que a pessoa pode FAZER no site (comprar, pedir
// orçamento, agendar, se candidatar, comparar...), descoberto nos formulários, botões, rotas,
// páginas e no schema.org (potentialAction). Cada interação vira um item com tipo, resumo de para
// que serve, o que é preciso informar, se pede login e o link. O agente explica em uma frase e
// encaminha para a parte do site que faz aquilo; ele nunca preenche nem envia nada sozinho.
import { normalize } from "../agent/text.js";

// Tipos de interação. sinais: expressão sobre o texto normalizado (título, botão, campos, href).
// exemplos: frases de quem quer fazer aquilo (o classificador aprende com elas).
export const TYPES = [
  { tipo: "compra", nome: "Compra", sinais: /\b(comprar|compre|adicionar ao carrinho|carrinho|checkout|finalizar (compra|pedido)|add to cart|buy now|fazer pedido|pedir agora)\b/, schema: ["BuyAction", "OrderAction"], resumo: "é onde você escolhe os itens, confere o total e finaliza a compra", exemplos: ["quero comprar", "como faço para comprar", "como finalizo a compra", "quero fazer um pedido", "como compro pelo site", "onde fica o carrinho"] },
  { tipo: "orcamento", nome: "Pedido de orçamento", sinais: /\b(orcament|cotac|cotar|proposta|quote|estimate|simul|solicitar valor)/, schema: ["QuoteAction"], resumo: "serve para pedir um preço sob medida: você descreve o que precisa e a equipe responde com os valores", exemplos: ["quero um orçamento", "quanto custa para o meu caso", "pedir uma cotação", "solicitar proposta", "fazer uma simulação", "preciso de um orçamento"] },
  { tipo: "agendamento", nome: "Agendamento", sinais: /\b(agend|marcar (horario|consulta|visita|reuniao)|horarios? disponive|appointment|book a|schedule|calendario|disponibilidade)/, schema: ["ScheduleAction"], resumo: "serve para escolher dia e horário de um atendimento", exemplos: ["quero agendar", "marcar um horário", "tem horário disponível", "como faço um agendamento", "quero marcar uma visita", "agendar atendimento"] },
  { tipo: "reserva", nome: "Reserva", sinais: /\b(reserv|booking|check availability|disponibilidade de quartos?)/, schema: ["ReserveAction", "LodgingReservation"], resumo: "serve para garantir a sua vaga (mesa, quarto, ingresso) na data escolhida", exemplos: ["quero fazer uma reserva", "reservar para sábado", "como reservo", "tem vaga para dia 10", "fazer reserva pelo site"] },
  { tipo: "candidatura", nome: "Trabalhe conosco / candidatura", sinais: /\b(trabalhe conosco|vagas?( de emprego)?|carreiras?|candidat|curriculo|careers?|jobs?|apply now|envie seu cv|banco de talentos|recrutamento)\b/, schema: ["ApplyAction", "JobPosting"], resumo: "é onde você vê as vagas abertas e envia seu currículo para a equipe", exemplos: ["quero trabalhar aí", "tem vaga de emprego", "como envio meu currículo", "trabalhe conosco", "quero me candidatar", "vocês estão contratando"] },
  { tipo: "contato", nome: "Contato", sinais: /\b(contato|fale conosco|fale com|contact|mensagem|whatsapp|envie sua (mensagem|duvida)|atendimento)\b/, schema: ["CommunicateAction", "ContactPage"], resumo: "serve para mandar uma mensagem para a equipe; a resposta chega pelo canal que você informar", exemplos: ["quero falar com vocês", "como entro em contato", "mandar uma mensagem", "fale conosco", "quero tirar uma dúvida com a equipe"] },
  { tipo: "suporte", nome: "Suporte / chamado", sinais: /\b(suporte|chamado|ticket|reclamac|sac|ouvidoria|reportar|problema com|support|help desk|abrir (um )?chamado|trocas? e devoluc)/, schema: [], resumo: "serve para registrar um problema e acompanhar a solução com a equipe", exemplos: ["tive um problema", "quero abrir um chamado", "quero fazer uma reclamação", "preciso de suporte", "abrir ticket", "registrar um problema"] },
  { tipo: "cadastro", nome: "Cadastro", sinais: /\b(cadastr|criar (uma )?conta|registr|sign ?up|crie sua conta|comece (ja|agora|gratis))/, schema: ["RegisterAction"], resumo: "é onde você cria sua conta para acompanhar pedidos e guardar seus dados", exemplos: ["quero me cadastrar", "como crio uma conta", "fazer cadastro", "criar conta", "sign up"] },
  { tipo: "login", nome: "Entrar na conta", sinais: /\b(login|entrar|acessar (minha )?conta|sign ?in|log ?in|area do cliente|minha conta)\b/, schema: [], resumo: "é onde você entra na sua conta com e-mail e senha", exemplos: ["como entro na minha conta", "fazer login", "acessar minha conta", "área do cliente"] },
  { tipo: "inscricao", nome: "Inscrição", sinais: /\b(inscri|matricul|enroll|participar do evento|garanta sua vaga|quero participar)/, schema: ["JoinAction", "RegisterAction", "EventReservation"], resumo: "serve para garantir sua participação (curso, evento, turma)", exemplos: ["quero me inscrever", "como faço a inscrição", "quero participar", "fazer matrícula", "garantir minha vaga"] },
  { tipo: "newsletter", nome: "Newsletter", sinais: /\b(newsletter|assine (nossa|a) (lista|news)|receba (novidades|ofertas|promoc)|subscribe|inscreva-se para receber)/, schema: ["SubscribeAction"], resumo: "serve para receber novidades e ofertas por e-mail; dá para cancelar quando quiser", exemplos: ["quero receber novidades", "assinar a newsletter", "receber promoções por email", "cadastrar meu email para ofertas"] },
  { tipo: "rastreio", nome: "Acompanhar pedido / rastreio", sinais: /\b(rastre|tracking|acompanh(e|ar) (seu |o |meu )?pedido|status do pedido|track (your |my )?order|localizar (objeto|encomenda))/, schema: ["TrackAction"], resumo: "serve para ver em que etapa está o seu pedido ou encomenda", exemplos: ["onde está meu pedido", "rastrear pedido", "acompanhar minha encomenda", "status da entrega", "meu pedido já saiu?"] },
  { tipo: "comparacao", nome: "Comparação", sinais: /\b(compar|versus|\bvs\b|lado a lado|diferenca entre)/, schema: [], resumo: "mostra itens lado a lado para você ver as diferenças antes de escolher", exemplos: ["quero comparar produtos", "qual a diferença entre eles", "comparar lado a lado", "comparar modelos"] },
  { tipo: "busca", nome: "Busca", sinais: /\b(busca|buscar|pesquis|procurar|search)\b/, schema: ["SearchAction"], resumo: "procura em todo o site pelo que você digitar", exemplos: ["pesquisar no site", "onde fica a busca", "como procuro algo no site"] },
  { tipo: "download", nome: "Download", sinais: /\b(download|baixar|baixe|app store|google play|play store|apk|instalar o app)\b/, schema: ["DownloadAction", "InstallAction"], resumo: "é onde você baixa o arquivo ou o aplicativo", exemplos: ["quero baixar o app", "onde baixo", "link para download", "baixar no celular", "tem aplicativo"] },
  { tipo: "doacao", nome: "Doação", sinais: /\b(doe|doar|doacao|donate|donation|contribua|apoie|apoiar)\b/, schema: ["DonateAction"], resumo: "serve para apoiar o projeto com uma contribuição", exemplos: ["quero doar", "como faço uma doação", "quero apoiar o projeto", "contribuir"] },
  { tipo: "avaliacao", nome: "Avaliação", sinais: /\b(avali(e|ar|acao)|deixe sua opiniao|review|depoimento|nota)\b/, schema: ["ReviewAction"], resumo: "serve para dar sua opinião e nota sobre um item ou atendimento", exemplos: ["quero avaliar", "deixar minha opinião", "escrever um review", "dar uma nota"] },
  { tipo: "parceria", nome: "Parcerias e fornecedores", sinais: /\b(parceri|fornecedor|seja (um )?(parceiro|revendedor|afiliado)|revend|afiliad|partner|supplier|b2b)\b/, schema: [], resumo: "é a área para empresas que querem vender, fornecer ou fazer parceria com o site", exemplos: ["quero ser fornecedor", "quero ser parceiro", "como revendo", "proposta de parceria", "sou de uma empresa e quero oferecer produtos"] },
];
export const typeById = (t) => TYPES.find((x) => x.tipo === t);

const LOGIN_PATH = /(conta|account|perfil|profile|painel|dashboard|meus?-|minha-|area-do-cliente|admin)/i;
const PRIVATE_FIELD = /\b(senha|password)\b/;
const joinList = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`);
const cleanField = (f) =>
  String(f || "")
    .replace(/[*:]+/g, "")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 40);

// Qual tipo explica melhor um texto (título + botão + campos + href). Devolve o tipo ou null.
export function classifyInteraction(text) {
  const n = normalize(text);
  let best = null;
  for (const t of TYPES) {
    const m = n.match(new RegExp(t.sinais.source, "g"));
    if (m && (!best || m.length > best.n)) best = { t, n: m.length };
  }
  return best?.t || null;
}

/**
 * Interações a partir do relatório do raio X (e, se houver, da observação: formulários usados).
 * setor: base setorial escolhida (as frases típicas do setor entram nos exemplos).
 */
// "Agendar consulta | Clínica X" → "Agendar consulta" (tira o nome do site do título).
export function shortTitle(title, site = "") {
  const parts = String(title || "").split(/\s+[|–—·-]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return String(title || "").trim();
  const rest = parts.filter((p) => normalize(p) !== normalize(site));
  return (rest.length < parts.length ? rest : parts.slice(0, 1)).join(" - ");
}
const compact = (f) => normalize(f).replace(/[^a-z0-9]/g, "");
// Rótulo e nome do mesmo campo ("E-mail" e "email", "Nome completo" e "nome") contam uma vez só.
export function dedupeFields(fields) {
  const out = [];
  for (const f of fields) {
    const c = compact(f);
    if (!c || out.some((o) => compact(o).includes(c) || c.includes(compact(o)))) continue;
    out.push(f);
  }
  return out;
}
// Caminho do próprio site a partir de um alvo do schema.org ("https://site.com/agendar" → "/agendar").
const pathOf = (url, origin) => {
  try {
    const u = new URL(url, "http://local.invalid");
    if (u.host === "local.invalid" || (origin && u.host === origin)) return `${u.pathname}${u.search}`.replace(/\{[^}]*\}/g, "");
    return u.href;
  } catch {
    return "";
  }
};

export function mapInteractions(report = {}, { setor = null, observacao = null } = {}) {
  const site = report.projeto?.site || "";
  const pages = (report.paginas || []).map((p) => ({ ...p, titulo: shortTitle(p.titulo, site) }));
  const hosts = new Set(pages.flatMap((p) => (p.acoesSchema || []).map((a) => { try { return new URL(a.alvo).host; } catch { return ""; } })).filter(Boolean));
  const pageOf = (file) => pages.find((p) => p.arquivo === file);
  const found = new Map();
  const add = (tipo, { titulo, link, campos = [], login = false, origem, metodo = "" }) => {
    const t = typeById(tipo);
    if (!t) return;
    const key = `${tipo}|${link || ""}`;
    const prev = found.get(key);
    const fields = dedupeFields([...(prev?.campos || []), ...campos.map(cleanField).filter((f) => f && !/^(submit|enviar|csrf|token)$/.test(f))]).slice(0, 8);
    found.set(key, { tipo, titulo: prev?.titulo || titulo || t.nome, link: prev?.link || link || "", campos: fields, requerLogin: Boolean(prev?.requerLogin || login), origens: [...new Set([...(prev?.origens || []), origem])], metodo: prev?.metodo || metodo });
  };

  // 1) Formulários (o sinal mais forte: é onde a pessoa realmente faz algo).
  for (const f of report.formularios || []) {
    const page = pageOf(f.arquivo);
    const text = [page?.titulo, f.botao, ...(f.campos || []), f.action].join(" ");
    const t = classifyInteraction(text);
    if (!t || (t.tipo === "busca" && f.method !== "get")) continue;
    if (t.tipo === "login" && (f.campos || []).some((c) => /nome|name|telefone|phone/i.test(c))) continue;
    add(t.tipo, { titulo: page?.titulo, link: page?.href || "", campos: f.campos || [], login: LOGIN_PATH.test(page?.href || ""), origem: `formulário (${f.arquivo})`, metodo: f.method });
  }
  // Sinais mais fracos (schema, páginas, links) não criam uma segunda interação do mesmo tipo
  // quando um formulário já mostrou onde ela acontece.
  const hasType = (tipo) => [...found.values()].some((x) => x.tipo === tipo);
  // 2) schema.org potentialAction nas páginas (com o endereço de destino, quando houver).
  const origin = hosts.size === 1 ? [...hosts][0] : "";
  for (const p of pages)
    for (const a of p.acoesSchema || []) {
      const t = TYPES.find((x) => x.schema.includes(a.tipo || a));
      if (!t) continue;
      const link = (a.alvo && pathOf(a.alvo, origin)) || p.href;
      const sameLink = [...found.values()].some((x) => x.tipo === t.tipo && x.link === link);
      if (sameLink || !hasType(t.tipo)) add(t.tipo, { titulo: pages.find((x) => x.href === link)?.titulo || p.titulo, link, origem: `schema.org/${a.tipo || a}` });
    }
  // 3) Páginas e links com nome de interação ("Trabalhe conosco", "Orçamento", "Parceiros").
  for (const p of pages) {
    const t = classifyInteraction(`${p.titulo} ${p.href.replace(/[/_.-]+/g, " ")}`);
    if (t && !["busca", "comparacao", "avaliacao", "login"].includes(t.tipo) && (!hasType(t.tipo) || found.has(`${t.tipo}|${p.href}`)))
      add(t.tipo, { titulo: p.titulo, link: p.href, login: LOGIN_PATH.test(p.href), origem: `página ${p.href}` });
  }
  for (const l of report.links || []) {
    if (!l.href || /^(https?:|#|mailto:|tel:)/i.test(l.href) || /^\/?api\//i.test(l.href) || l.vezes < 1) continue;
    const t = classifyInteraction(`${l.texto} ${l.href.replace(/[/_.-]+/g, " ")}`);
    if (t && ["candidatura", "orcamento", "agendamento", "reserva", "parceria", "download", "doacao", "rastreio", "suporte", "inscricao"].includes(t.tipo) && ![...found.values()].some((x) => x.tipo === t.tipo))
      add(t.tipo, { titulo: l.texto, link: l.href.startsWith("/") ? l.href : `/${l.href.replace(/^\.?\//, "")}`, origem: `link "${l.texto}"` });
  }
  // Downloads de loja de aplicativo (links externos para App Store / Google Play).
  const store = (report.links || []).find((l) => /apps\.apple\.com|play\.google\.com/i.test(l.href));
  if (store) add("download", { titulo: store.texto || "Baixar o aplicativo", link: store.href, origem: "link da loja de aplicativos" });
  // 4) Observação: formulários que a pessoa realmente usou (segunda etapa).
  for (const f of observacao?.formularios || []) {
    const fields = (f.campos || []).filter((c) => c?.tipo !== "password").map((c) => (typeof c === "string" ? c : c.rotulo || c.nome)).filter(Boolean);
    const t = classifyInteraction([f.titulo, f.botao, ...fields, f.pagina].join(" "));
    if (t) add(t.tipo, { titulo: shortTitle(f.titulo, site), link: f.pagina, campos: fields, login: LOGIN_PATH.test(f.pagina || ""), origem: "observação", metodo: f.metodo });
  }

  const frases = setor?.frases || {};
  const all = [...found.values()];
  return all.map((x, i) => {
    const t = typeById(x.tipo);
    const camposPublicos = x.campos.filter((c) => !PRIVATE_FIELD.test(normalize(c)));
    const partes = [`${x.titulo && normalize(x.titulo) !== normalize(t.nome) ? `"${x.titulo}"` : t.nome} ${t.resumo}.`];
    if (camposPublicos.length >= 2) partes.push(`Você vai informar ${joinList(camposPublicos.slice(0, 5))}.`);
    if (x.requerLogin) partes.push("É preciso entrar na sua conta.");
    // Mais de uma interação do mesmo tipo (dois formulários de contato): só a primeira leva as
    // frases de exemplo; as outras são achadas pelo título, para não confundir o classificador.
    const before = all.slice(0, i).filter((y) => y.tipo === x.tipo).length;
    return {
      id: before ? `${x.tipo}-${before + 1}` : x.tipo,
      tipo: x.tipo,
      titulo: x.titulo,
      resumo: partes.join(" "),
      campos: camposPublicos,
      requerLogin: x.requerLogin,
      link: x.link,
      exemplos: before ? [] : [...new Set([...t.exemplos, ...(frases[x.tipo] || [])])].slice(0, 20),
      origem: x.origens.join("; "),
    };
  });
}
