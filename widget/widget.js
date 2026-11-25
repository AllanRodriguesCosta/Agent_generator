// Widget do agente: botão flutuante + painel de conversa. Sem dependências, sem innerHTML com
// dados (tudo via textContent) e compatível com Content-Security-Policy sem 'unsafe-inline'.
// Uso: <link rel="stylesheet" href="/agente/widget.css">
//      <script type="module" src="/agente/widget.js"></script>
// Configuração em conhecimento/agente.json. Opcional: window.AGENTE_CONFIG = { aberto: true }.
import { createAgent } from "./nucleo/agent.js";
import { mapItems } from "./nucleo/catalog-map.js";
import { describeLookup, lookupHeaders } from "./nucleo/lookup.js";
import { anonymize, isMiss } from "./nucleo/privacy.js";
import { sanitizeUser } from "./nucleo/context.js";
import { withRemoteIa } from "./nucleo/ia.js";

const FILES = ["agente", "intencoes", "faq", "paginas", "catalogo", "fluxos", "consultas", "acoes", "setor", "conteudos", "interacoes", "midias", "perfil"];
const STORE = "agente_widget_v1";
const MAX_HISTORY = 30;
const MISSES = "agente_faltas_v1";
const MISS_DAYS = 90;
// Versão 0.8: dados da pessoa logada, só nesta aba (sessionStorage) e por pouco tempo.
const USER = "agente_usuario_v1";
// Versão 0.10: formulário a preencher (captura de contato) e mensagem proativa já mostrada.
const PENDING_FORM = "agente_formulario_v1";
const NUDGE = "agente_proativa_v1";

// ---- Versão 0.10: preencher o formulário do próprio site ----
// O agente pergunta nome e e-mail/telefone na conversa; o widget coloca nos campos do formulário
// da página (sem enviar). Os dados ficam só nesta aba, por 10 minutos, e somem depois de usados.
const FIELD_RULES = {
  email: (d) => d.tipo === "email" || /e-?mail/.test(d.texto),
  telefone: (d) => d.tipo === "tel" || /(telefone|celular|whats|fone|phone|\btel\b)/.test(d.texto),
  nome: (d) => /\b(nome|name|seu nome|full ?name)\b/.test(d.texto) && !/(e-?mail|empresa|usuario|user ?name|login)/.test(d.texto),
  mensagem: (d) => d.tag === "textarea" || /(mensagem|message|duvida|descri|detalhe|observ|comentario|assunto)/.test(d.texto),
};
/** descs: [{ tag, tipo, texto }] dos campos de um formulário → { índice: chave } (um campo por dado). */
export function matchFields(descs, valores) {
  const out = {};
  for (const key of ["email", "telefone", "nome", "mensagem"]) {
    if (!valores?.[key]) continue;
    const i = descs.findIndex((d, j) => !(j in out) && FIELD_RULES[key](d) && (key !== "mensagem" || d.tag === "textarea" || !descs.some((x, k) => !(k in out) && x.tag === "textarea")));
    if (i >= 0) out[i] = key;
  }
  return out;
}
const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function describeField(node) {
  const id = node.id;
  const label = id ? globalThis.document.querySelector(`label[for="${globalThis.CSS?.escape ? globalThis.CSS.escape(id) : id}"]`)?.textContent : "";
  const prev = node.previousElementSibling?.tagName === "LABEL" ? node.previousElementSibling.textContent : "";
  return { tag: node.tagName.toLowerCase(), tipo: (node.getAttribute("type") || "").toLowerCase(), texto: fold([node.name, id, node.placeholder, node.getAttribute("aria-label"), node.getAttribute("autocomplete"), label, prev, node.closest("label")?.textContent].join(" ")) };
}
const FILLABLE = "input:not([type=hidden]):not([type=password]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]):not([type=file]), textarea";
/** Preenche o formulário da página que mais combina com os dados. Devolve quantos campos preencheu. */
export function fillForm(valores, doc = globalThis.document) {
  let best = null;
  for (const form of doc.querySelectorAll("form")) {
    if (form.closest(".agw-root")) continue;
    const nodes = [...form.querySelectorAll(FILLABLE)];
    const map = matchFields(nodes.map(describeField), valores);
    if (!best || Object.keys(map).length > Object.keys(best.map).length) best = { form, nodes, map };
  }
  if (!best || !Object.keys(best.map).length) return 0;
  for (const [i, key] of Object.entries(best.map)) {
    const node = best.nodes[i];
    // Setter nativo + eventos: funciona também em formulários de React/Vue.
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), "value")?.set;
    if (setter) setter.call(node, valores[key]);
    else node.value = valores[key];
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }
  best.form.scrollIntoView?.({ block: "center" });
  return Object.keys(best.map).length;
}
const pathKey = (p) => `/${String(p || "").split(/[?#]/)[0].replace(/^\/+/, "")}`.replace(/\/index\.html?$/i, "/").replace(/\.html?$/i, "").replace(/\/+$/, "") || "/";
export const samePage = (a, b) => pathKey(a) === pathKey(b);
function savePendingForm(f) {
  try {
    globalThis.sessionStorage.setItem(PENDING_FORM, JSON.stringify({ pagina: f.pagina, valores: f.valores, ate: Date.now() + 10 * 60000 }));
  } catch {
    /* sem armazenamento: preenche só se já estiver na página */
  }
}
function takePendingForm() {
  try {
    const f = JSON.parse(globalThis.sessionStorage.getItem(PENDING_FORM) || "null");
    if (!f || f.ate < Date.now() || !samePage(f.pagina, globalThis.location.pathname)) return null;
    globalThis.sessionStorage.removeItem(PENDING_FORM);
    return f;
  } catch {
    return null;
  }
}

// Dados do usuário: o site entrega (identificar(), window.AGENTE_USUARIO ou
// <script type="application/json" id="agente-usuario">) ou o widget lê perfil.fonte com a sessão
// do próprio site. Nada vai para localStorage, para a IA opcional ou para o registro de faltas.
export function readCachedUser(now = Date.now()) {
  try {
    const c = JSON.parse(globalThis.sessionStorage.getItem(USER) || "null");
    return c && c.ate > now && c.dados && typeof c.dados === "object" ? c.dados : null;
  } catch {
    return null;
  }
}
export function cacheUser(dados, minutos = 15, now = Date.now()) {
  const clean = sanitizeUser(dados);
  try {
    if (clean) globalThis.sessionStorage.setItem(USER, JSON.stringify({ dados: clean, ate: now + minutos * 60000 }));
    else globalThis.sessionStorage.removeItem(USER);
  } catch {
    /* sem armazenamento: vale só enquanto a página estiver aberta */
  }
  return clean;
}
function userFromPage() {
  if (globalThis.AGENTE_USUARIO && typeof globalThis.AGENTE_USUARIO === "object") return globalThis.AGENTE_USUARIO;
  const tag = globalThis.document?.getElementById("agente-usuario");
  if (tag?.type === "application/json") {
    try {
      return JSON.parse(tag.textContent || "null");
    } catch {
      return null;
    }
  }
  return null;
}

// Versão 0.4: frases não entendidas, sem dado pessoal, neste navegador (até 100, por 90 dias).
export function readMisses(now = Date.now()) {
  try {
    const list = JSON.parse(globalThis.localStorage.getItem(MISSES) || "[]");
    return Array.isArray(list) ? list.filter((m) => m && typeof m.frase === "string" && now - new Date(m.em).getTime() < MISS_DAYS * 86400000) : [];
  } catch {
    return [];
  }
}
export function rememberMiss(frase, now = new Date()) {
  const texto = anonymize(frase);
  if (texto.length < 2) return null;
  try {
    globalThis.localStorage.setItem(MISSES, JSON.stringify([...readMisses(now.getTime()), { frase: texto, em: now.toISOString() }].slice(-100)));
  } catch {
    /* sem armazenamento: segue sem guardar */
  }
  return texto;
}

// Só links do próprio site ou http(s); qualquer outra coisa vira "#".
export function safeHref(href, origin = globalThis.location?.origin || "http://localhost") {
  try {
    const url = new URL(href, origin);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "#";
  } catch {
    return "#";
  }
}

// Lista de objetos dentro da resposta da API do site: o próprio array ou o primeiro array conhecido.
export function listFrom(data) {
  if (Array.isArray(data)) return data;
  for (const key of ["data", "items", "itens", "produtos", "products", "results", "resultados", "rows"]) if (Array.isArray(data?.[key])) return data[key];
  if (data && typeof data === "object") for (const v of Object.values(data)) if (Array.isArray(v)) return v;
  return [];
}

// Versão 0.8: passagem para uma pessoa com resumo. O link do WhatsApp já vai com as últimas
// perguntas da conversa, para ninguém precisar repetir tudo (a pessoa ainda revisa e envia).
const WHATSAPP = /^https:\/\/(wa\.me|api\.whatsapp\.com)\//i;
export function handoffText(mensagens = [], site = "o site") {
  const asked = mensagens.filter((m) => m.de === "voce").map((m) => String(m.texto).slice(0, 140)).slice(-3);
  return `Olá! Vim pelo assistente de ${site}.${asked.length ? ` Minhas dúvidas: ${asked.map((t) => `"${t}"`).join("; ")}.` : ""}`.slice(0, 600);
}
export function withHandoff(href, mensagens, site) {
  if (!WHATSAPP.test(href || "")) return href;
  try {
    const u = new URL(href);
    if (!u.searchParams.get("text")) u.searchParams.set("text", handoffText(mensagens, site));
    return u.href;
  } catch {
    return href;
  }
}

export async function loadKnowledge(base, fetchImpl = fetch) {
  const entries = await Promise.all(
    FILES.map(async (name) => {
      try {
        // Sem cache: depois de um treino (comando treinar) a base nova vale na hora.
        const res = await fetchImpl(new URL(`conhecimento/${name}.json`, base), { cache: "no-store" });
        return [name, res.ok ? await res.json() : undefined];
      } catch {
        return [name, undefined];
      }
    }),
  );
  const raw = Object.fromEntries(entries.filter(([, v]) => v !== undefined));
  const catalog = raw.catalogo;
  // Versão 0.9: catálogo desligado no instalador não busca a API.
  if (catalog?.url && raw.agente?.recursos?.catalogo !== false) {
    try {
      const res = await fetchImpl(new URL(catalog.url, globalThis.location?.href || base), { headers: { accept: "application/json" } });
      const mapped = res.ok ? mapItems(listFrom(await res.json()), catalog.url, catalog.campos || {}, 1) : null;
      if (mapped) raw.catalogo = { ...catalog, itens: mapped.itens };
    } catch {
      /* sem catálogo dinâmico: o agente segue com o resto da base */
    }
  }
  return raw;
}

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) node.setAttribute(k, v === true ? "" : v);
  if (text != null) node.textContent = text;
  return node;
}

function load() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE) || "null");
    return saved && Array.isArray(saved.mensagens) ? saved : { mensagens: [], contexto: {} };
  } catch {
    return { mensagens: [], contexto: {} };
  }
}
function save(state) {
  try {
    sessionStorage.setItem(STORE, JSON.stringify({ ...state, mensagens: state.mensagens.slice(-MAX_HISTORY) }));
  } catch {
    /* navegação privada sem armazenamento: só não guarda o histórico */
  }
}

export async function mount(options = {}) {
  if (document.querySelector(".agw-root")) return;
  const base = new URL(".", import.meta.url);
  const raw = await loadKnowledge(base);
  let agent = createAgent(raw);
  const { agente } = agent.knowledge;
  // Versão 0.6: endpoint relativo ("../api/agente") é resolvido a partir do próprio widget, para o
  // modo serviço (agente hospedado à parte, ao lado de um site já publicado).
  const endpoint = agente.endpoint && agente.endpoint.startsWith(".") ? new URL(agente.endpoint, base).href : agente.endpoint;
  // Versão 0.11: serviço do agente com a chave da IA (ex.: Cloudflare). O agente continua aqui no
  // navegador; só a frase que ele não entendeu vai ao serviço, que devolve a pergunta reescrita.
  const iaEndpoint = !endpoint && agente.ia?.endpoint ? (agente.ia.endpoint.startsWith(".") ? new URL(agente.ia.endpoint, base).href : agente.ia.endpoint) : "";
  let remoto = iaEndpoint ? withRemoteIa(agent, iaEndpoint) : null;
  const state = load();
  const perfilCfg = agent.recursos?.perfil === false ? { ...agent.knowledge.perfil, ativo: false } : agent.knowledge.perfil;
  let usuario = sanitizeUser(userFromPage()) || readCachedUser();
  // Lê perfil.fonte (caminho do próprio site) com o cookie da sessão; 401/403 = não logado.
  async function ensureUser() {
    if (usuario || !perfilCfg.ativo || !perfilCfg.fonte) return usuario;
    try {
      const res = await fetch(new URL(perfilCfg.fonte, location.href), { credentials: "same-origin", headers: { accept: "application/json", ...lookupHeaders(agent.knowledge.consultas.auth) } });
      if (res.ok) usuario = cacheUser(await res.json(), perfilCfg.validadeMin);
    } catch {
      /* sem dados: o agente pede login */
    }
    return usuario;
  }
  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

  const root = el("div", { class: `agw-root agw-${agente.posicao}` });
  root.style.setProperty("--agw-cor", agente.cor);
  const launcher = el("button", { type: "button", class: "agw-launcher", "aria-expanded": "false", "aria-controls": "agw-panel" });
  launcher.append(el("span", { class: "agw-launcher-dot", "aria-hidden": "true" }), el("span", {}, "Ajuda"));
  launcher.setAttribute("aria-label", `Abrir ${agente.nome}`);
  const panel = el("section", { id: "agw-panel", class: "agw-panel", role: "dialog", "aria-label": agente.nome, hidden: true });
  const header = el("header", { class: "agw-header" });
  const title = el("strong", {}, agente.nome);
  const clear = el("button", { type: "button", class: "agw-icon", title: "Limpar conversa", "aria-label": "Limpar conversa" }, "↺");
  const close = el("button", { type: "button", class: "agw-icon", title: "Fechar", "aria-label": "Fechar" }, "×");
  header.append(title, clear, close);
  const log = el("div", { class: "agw-log", role: "log", "aria-live": "polite", "aria-relevant": "additions" });
  const chips = el("div", { class: "agw-chips" });
  const form = el("form", { class: "agw-form" });
  const input = el("input", { type: "text", class: "agw-input", maxlength: "500", autocomplete: "off", "aria-label": "Sua mensagem", placeholder: "Escreva sua pergunta..." });
  const send = el("button", { type: "submit", class: "agw-send" }, "Enviar");
  form.append(input, send);
  panel.append(header, log, chips, form);
  root.append(panel, launcher);
  document.body.append(root);

  function renderChips(list = []) {
    chips.replaceChildren(...list.slice(0, 4).map((c) => {
      const b = el("button", { type: "button", class: "agw-chip" }, c);
      b.addEventListener("click", () => ask(c));
      return b;
    }));
  }
  function bubble(msg) {
    const item = el("div", { class: `agw-msg agw-${msg.de}`, ...(msg.intencao ? { "data-intencao": msg.intencao } : {}) });
    item.append(el("p", {}, msg.texto));
    if (msg.interpretado) item.append(el("p", { class: "agw-note" }, `Entendi como “${msg.interpretado}”.`));
    if (msg.itens?.length) {
      const list = el("ul", { class: "agw-items" });
      for (const it of msg.itens) {
        const li = el("li", { class: "agw-item" });
        const box = it.link ? el("a", { href: safeHref(it.link) }) : el("div");
        if (it.imagem) box.append(el("img", { src: safeHref(it.imagem), alt: "", loading: "lazy", width: "48", height: "48" }));
        const info = el("span", { class: "agw-item-info" });
        info.append(el("span", { class: "agw-item-name" }, it.nome));
        if (it.precoTexto) info.append(el("span", { class: "agw-item-price" }, it.precoTexto));
        box.append(info);
        li.append(box);
        list.append(li);
      }
      item.append(list);
    }
    if (msg.imagens?.length) {
      const box = el("div", { class: "agw-photos" });
      for (const im of msg.imagens.slice(0, 4)) {
        const fig = el("figure", { class: "agw-photo" });
        const a = el("a", { href: safeHref(im.src), target: "_blank", rel: "noopener noreferrer", "aria-label": `Abrir a foto: ${im.legenda || "foto"}` });
        a.append(el("img", { src: safeHref(im.src), alt: im.legenda || "", loading: "lazy" }));
        fig.append(a);
        if (im.legenda) fig.append(el("figcaption", {}, im.legenda));
        box.append(fig);
      }
      item.append(box);
    }
    // Versão 0.10: vídeos e PDFs como cartões (abrem na plataforma/arquivo, sem incorporar).
    if (msg.cartoes?.length) {
      const list = el("ul", { class: "agw-cards" });
      for (const c of msg.cartoes.slice(0, 4)) {
        const external = c.tipo === "pdf" || (/^https?:\/\//i.test(c.href) && !c.href.startsWith(location.origin));
        const a = el("a", { class: "agw-card", href: safeHref(c.href), ...(external ? { target: "_blank", rel: "noopener noreferrer" } : {}) });
        a.append(el("span", { class: `agw-card-icon agw-card-${c.tipo === "video" ? "video" : "pdf"}`, "aria-hidden": "true" }, c.tipo === "video" ? "▶" : "PDF"));
        const info = el("span", { class: "agw-item-info" });
        info.append(el("span", { class: "agw-item-name" }, c.titulo), el("span", { class: "agw-item-price" }, c.tipo === "pdf" ? "Abrir o PDF" : c.plataforma === "youtube" ? "Assistir no YouTube" : c.plataforma === "vimeo" ? "Assistir no Vimeo" : "Assistir o vídeo"));
        a.append(info);
        const li = el("li");
        li.append(a);
        list.append(li);
      }
      item.append(list);
    }
    if (msg.acoes?.length) {
      const actions = el("div", { class: "agw-actions" });
      for (const a of msg.acoes) {
        const external = /^https?:\/\//i.test(a.href) && !a.href.startsWith(location.origin);
        const link = el("a", { class: "agw-action", href: safeHref(a.href), ...(external ? { target: "_blank", rel: "noopener noreferrer" } : {}) }, a.rotulo);
        // WhatsApp: o resumo é montado na hora do clique (com a conversa até ali).
        if (WHATSAPP.test(a.href)) link.addEventListener("click", () => link.setAttribute("href", safeHref(withHandoff(a.href, state.mensagens, agente.site))));
        actions.append(link);
      }
      item.append(actions);
    }
    log.append(item);
    log.scrollTop = log.scrollHeight;
  }
  function render() {
    log.replaceChildren();
    if (!state.mensagens.length) {
      const hello = agent.saudacao(usuario);
      state.mensagens.push({ de: "bot", texto: hello.texto });
      renderChips(hello.sugestoes);
    }
    state.mensagens.forEach(bubble);
    log.scrollTop = log.scrollHeight;
  }
  async function answer(text) {
    // Modo navegador: os dados do usuário ficam aqui mesmo. Modo servidor: o servidor nunca recebe
    // os dados; o widget completa as respostas de perfil localmente (abaixo).
    if (!endpoint) return remoto ? remoto.replyAsync(text, state.contexto, { usuario }) : agent.reply(text, state.contexto, { usuario });
    const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mensagem: text, contexto: state.contexto }) });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }
  async function ask(text) {
    const clean = String(text || "").trim().slice(0, 500);
    if (!clean) return;
    const user = { de: "voce", texto: clean };
    state.mensagens.push(user);
    bubble(user);
    input.value = "";
    let r;
    const typing = el("div", { class: "agw-msg agw-bot agw-typing", "aria-label": `${agente.nome} está digitando` });
    typing.append(el("span"), el("span"), el("span"));
    log.append(typing);
    log.scrollTop = log.scrollHeight;
    const started = Date.now();
    try {
      r = await answer(clean);
    } catch {
      r = { texto: "Não consegui responder agora. Tente de novo em instantes.", sugestoes: [] };
    }
    // Versão 0.8: pergunta sobre os próprios dados (perfil): busca os dados do site e completa.
    if (r.perfil?.id && (endpoint || !usuario)) {
      const dados = await ensureUser();
      if (dados) {
        const filled = agent.perfil(r.perfil.id, dados, r.perfil);
        if (filled) r = { ...r, ...filled, contexto: { ...(r.contexto || {}), ...(filled.contexto || {}) } };
      }
    }
    // Digitação: um pouco de espera proporcional ao tamanho (até 1,2 s), sem animação se a
    // pessoa pediu menos movimento.
    const pause = reducedMotion ? 0 : Math.min(1200, (agente.digitacao || 0) * String(r.texto || "").length) - (Date.now() - started);
    if (pause > 0) await wait(pause);
    typing.remove();
    // Consulta da conta (pedidos, agendamentos...): lê a API do próprio site com a sessão de quem
    // está logado e resume. Só caminhos do próprio site (a base já recusa outros domínios).
    if (r.consulta?.url) {
      let lookup;
      try {
        // Cookie do próprio site ou, se a base pedir, o token que o site guarda no navegador.
        const res = await fetch(new URL(r.consulta.url, location.href), { credentials: "same-origin", headers: lookupHeaders(r.consulta.auth) });
        lookup = describeLookup(r.consulta, { status: res.status, dados: res.ok ? await res.json().catch(() => null) : null }, agent.knowledge.agente);
      } catch {
        lookup = describeLookup(r.consulta, { status: 0 }, agent.knowledge.agente);
      }
      r = { ...r, texto: lookup.texto, acoes: lookup.acoes };
    }
    // Frase não entendida: guarda aqui e, se a base tiver "registro", manda ao servidor do site.
    if (isMiss(r)) {
      const texto = rememberMiss(clean);
      if (texto && agente.registro && !endpoint)
        fetch(agente.registro, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mensagem: texto, falta: true }) }).catch(() => {});
    }
    // Versão 0.10: formulário preenchido pela conversa. Na própria página, preenche já; em outra,
    // guarda (só nesta aba, 10 min) e preenche quando a pessoa abrir a página pelo botão.
    if (r.formulario?.pagina && r.formulario.valores) {
      if (samePage(r.formulario.pagina, location.pathname) && fillForm(r.formulario.valores)) r = { ...r, texto: `${r.texto} Já preenchi o formulário desta página: confira e clique em enviar.`, acoes: [] };
      else savePendingForm(r.formulario);
    }
    const bot = { de: "bot", texto: r.texto, acoes: r.acoes || [], itens: r.itens || [], imagens: (r.imagens || []).slice(0, 4), ...(r.cartoes?.length ? { cartoes: r.cartoes.slice(0, 4) } : {}), intencao: r.intencao || "", ...(typeof r.interpretado === "string" ? { interpretado: r.interpretado.slice(0, 160) } : {}) };
    state.mensagens.push(bot);
    state.contexto = r.contexto || {};
    bubble(bot);
    renderChips(r.sugestoes || []);
    // As sugestões mudam a altura da conversa: rola de novo para a última mensagem.
    log.scrollTop = log.scrollHeight;
    save(state);
    // Para o modo treino (e para quem quiser medir): pergunta, resposta e intenção.
    document.dispatchEvent(new CustomEvent("agente:resposta", { detail: { pergunta: clean, resposta: r.texto, intencao: r.intencao || "", fonte: r.fonte || "" } }));
  }
  // Base alterada (modo treino): recarrega e recria o agente sem recarregar a página.
  document.addEventListener("agente:recarregar", async () => {
    agent = createAgent(await loadKnowledge(base));
    remoto = iaEndpoint ? withRemoteIa(agent, iaEndpoint) : null;
  });
  function setOpen(open) {
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    root.classList.toggle("agw-open", open);
    if (open) {
      render();
      input.focus();
    } else launcher.focus();
  }
  launcher.addEventListener("click", () => setOpen(panel.hidden));
  close.addEventListener("click", () => setOpen(false));
  clear.addEventListener("click", () => {
    state.mensagens = [];
    state.contexto = {};
    save(state);
    render();
    input.focus();
  });
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    ask(input.value);
  });
  if (options.aberto) setOpen(true);
  // Versão 0.10: chegou à página do formulário que a conversa preparou: preenche e avisa.
  const pending = takePendingForm();
  if (pending) {
    const n = fillForm(pending.valores);
    const note = { de: "bot", texto: n ? "Preenchi o formulário com os dados que você me passou. Confira e clique em enviar quando estiver tudo certo." : "Não achei o formulário nesta página. Os dados que você me passou não foram guardados." };
    state.mensagens.push(note);
    save(state);
    if (!panel.hidden) bubble(note);
  }
  // Versão 0.10 (M2): mensagem proativa da página (uma por sessão, depois de alguns segundos,
  // só se a conversa ainda não começou). AGENTE_CONFIG.proativa = false desliga.
  const nudge = options.proativa !== false && agent.proativa?.(location.pathname);
  let nudgeTimer = null;
  const nudgeSeen = () => {
    try {
      return Boolean(sessionStorage.getItem(NUDGE));
    } catch {
      return true;
    }
  };
  if (nudge && !nudgeSeen() && state.mensagens.length <= 1)
    nudgeTimer = setTimeout(() => {
      if (!panel.hidden || nudgeSeen()) return;
      try {
        sessionStorage.setItem(NUDGE, "1");
      } catch {
        /* sem armazenamento: mostra só esta vez */
      }
      const box = el("div", { class: "agw-nudge", role: "status" });
      const go = el("button", { type: "button", class: "agw-chip" }, nudge.sugestoes[0] || "Conversar");
      const dismiss = el("button", { type: "button", class: "agw-nudge-close", "aria-label": "Dispensar a mensagem" }, "×");
      box.append(dismiss, el("p", {}, nudge.texto), go);
      go.addEventListener("click", () => {
        box.remove();
        setOpen(true);
        if (nudge.sugestoes[0]) ask(nudge.sugestoes[0]);
      });
      dismiss.addEventListener("click", () => box.remove());
      launcher.addEventListener("click", () => box.remove(), { once: true });
      root.append(box);
    }, nudge.aposSeg * 1000);
  launcher.addEventListener("click", () => clearTimeout(nudgeTimer), { once: true });
  // No console: agente.faltas() lista; agente.exportarFaltas() baixa o JSON para "agent-generator aprender".
  const exportMisses = () => {
    const blob = new globalThis.Blob([JSON.stringify(readMisses(), null, 2)], { type: "application/json" });
    const a = el("a", { href: URL.createObjectURL(blob), download: "faltas.json" });
    document.body.append(a);
    a.click();
    a.remove();
  };
  // Versão 0.8: o site informa quem está logado (depois do login) e limpa ao sair.
  const identificar = (dados) => {
    usuario = cacheUser(dados, perfilCfg.validadeMin);
    return Boolean(usuario);
  };
  const sair = () => {
    usuario = null;
    cacheUser(null);
  };
  document.addEventListener("agente:identificar", (e) => identificar(e.detail));
  document.addEventListener("agente:sair", sair);
  if (perfilCfg.ativo && perfilCfg.fonte && !usuario) ensureUser();
  return { ask, open: () => setOpen(true), close: () => setOpen(false), agent, faltas: () => readMisses(), exportarFaltas: exportMisses, identificar, sair };
}

if (typeof document !== "undefined" && !globalThis.AGENTE_CONFIG?.manual) {
  const start = () => mount(globalThis.AGENTE_CONFIG || {}).then((api) => (globalThis.agente = api)).catch((e) => console.warn("Agente não iniciou:", e));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
}
