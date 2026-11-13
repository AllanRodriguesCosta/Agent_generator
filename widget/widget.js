// Widget do agente: botão flutuante + painel de conversa. Sem dependências, sem innerHTML com
// dados (tudo via textContent) e compatível com Content-Security-Policy sem 'unsafe-inline'.
// Uso: <link rel="stylesheet" href="/agente/widget.css">
//      <script type="module" src="/agente/widget.js"></script>
// Configuração em conhecimento/agente.json. Opcional: window.AGENTE_CONFIG = { aberto: true }.
import { createAgent } from "./nucleo/agent.js";
import { mapItems } from "./nucleo/catalog-map.js";

const FILES = ["agente", "intencoes", "faq", "paginas", "catalogo"];
const STORE = "agente_widget_v1";
const MAX_HISTORY = 30;

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

export async function loadKnowledge(base, fetchImpl = fetch) {
  const entries = await Promise.all(
    FILES.map(async (name) => {
      try {
        const res = await fetchImpl(new URL(`conhecimento/${name}.json`, base));
        return [name, res.ok ? await res.json() : undefined];
      } catch {
        return [name, undefined];
      }
    }),
  );
  const raw = Object.fromEntries(entries.filter(([, v]) => v !== undefined));
  const catalog = raw.catalogo;
  if (catalog?.url) {
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
  const agent = createAgent(raw);
  const { agente } = agent.knowledge;
  const endpoint = agente.endpoint;
  const state = load();

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
    const item = el("div", { class: `agw-msg agw-${msg.de}` });
    item.append(el("p", {}, msg.texto));
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
    if (msg.acoes?.length) {
      const actions = el("div", { class: "agw-actions" });
      for (const a of msg.acoes) {
        const external = /^https?:\/\//i.test(a.href) && !a.href.startsWith(location.origin);
        actions.append(el("a", { class: "agw-action", href: safeHref(a.href), ...(external ? { target: "_blank", rel: "noopener noreferrer" } : {}) }, a.rotulo));
      }
      item.append(actions);
    }
    log.append(item);
    log.scrollTop = log.scrollHeight;
  }
  function render() {
    log.replaceChildren();
    if (!state.mensagens.length) {
      const hello = agent.saudacao();
      state.mensagens.push({ de: "bot", texto: hello.texto });
      renderChips(hello.sugestoes);
    }
    state.mensagens.forEach(bubble);
    log.scrollTop = log.scrollHeight;
  }
  async function answer(text) {
    if (!endpoint) return agent.reply(text, state.contexto);
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
    try {
      r = await answer(clean);
    } catch {
      r = { texto: "Não consegui responder agora. Tente de novo em instantes.", sugestoes: [] };
    }
    const bot = { de: "bot", texto: r.texto, acoes: r.acoes || [], itens: r.itens || [] };
    state.mensagens.push(bot);
    state.contexto = r.contexto || {};
    bubble(bot);
    renderChips(r.sugestoes || []);
    // As sugestões mudam a altura da conversa: rola de novo para a última mensagem.
    log.scrollTop = log.scrollHeight;
    save(state);
  }
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
  return { ask, open: () => setOpen(true), close: () => setOpen(false), agent };
}

if (typeof document !== "undefined" && !globalThis.AGENTE_CONFIG?.manual) {
  const start = () => mount(globalThis.AGENTE_CONFIG || {}).then((api) => (globalThis.agente = api)).catch((e) => console.warn("Agente não iniciou:", e));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
}
