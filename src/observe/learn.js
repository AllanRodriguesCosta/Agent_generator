// O que a observação ensina ao agente (versão 0.3). Recebe os eventos do gravador (páginas,
// cliques, formulários) e as chamadas vistas pelo proxy, e devolve:
// - paginas que o raio X não viu (sites de página única, rotas dinâmicas);
// - perguntas "Como faço para ...?" a partir dos formulários realmente usados;
// - a busca do site (link pronto com o termo), a página de login e o catálogo vindo da API;
// - consultas da conta (pedidos, agendamentos...) lidas da API com a sessão de quem está logado;
// - as ações que mudam dados (POST, PUT...), só listadas no relatório: o agente não as executa.
import { mapItems } from "../agent/catalog-map.js";
import { lookupFields, listOf } from "../agent/lookup.js";
import { normalize } from "../agent/text.js";

const SEARCH_KEYS = ["q", "busca", "search", "s", "termo", "query", "pesquisa", "keyword", "k"];
const LOGIN = /(login|entrar|signin|sign-in|acesso|acessar|auth)/i;
const GENERIC_BUTTON = /^(enviar|salvar|ok|continuar|confirmar|proximo|próximo|avancar|avançar|submit|send|go|ir)$/i;
const LABELS = [
  [/order|pedido|compra|purchase/, "pedidos"],
  [/appointment|agendamento|consulta|booking|agenda/, "agendamentos"],
  [/reserva|reservation/, "reservas"],
  [/ticket|chamado|suporte|support/, "chamados"],
  [/inscric|enrollment|matricula|subscription|assinatura/, "inscrições"],
  [/encomenda|request|solicita/, "solicitações"],
];
const EXAMPLES = {
  pedidos: ["onde está meu pedido", "status do meu pedido", "meu pedido já foi enviado?", "quero ver meus pedidos", "minha compra chegou?", "acompanhar meu pedido", "situação da minha compra", "como está minha compra"],
  agendamentos: ["quando é meu agendamento", "ver meus agendamentos", "status do meu agendamento", "meu horário está confirmado?", "qual o dia da minha consulta", "tenho algo marcado?"],
  reservas: ["minha reserva está confirmada?", "ver minhas reservas", "status da minha reserva", "para quando é minha reserva", "quero consultar minha reserva"],
  chamados: ["como está meu chamado", "ver meus chamados", "status do meu atendimento", "minha solicitação foi respondida?", "andamento do meu chamado"],
  "inscrições": ["minha inscrição foi confirmada?", "ver minhas inscrições", "status da minha inscrição", "em que estou inscrito", "consultar minha matrícula"],
  "solicitações": ["como está minha solicitação", "ver minhas solicitações", "status do meu pedido especial", "responderam minha solicitação?", "andamento da solicitação"],
};
const joinList = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`);
const pathOnly = (url) => String(url || "").split(/[?#]/)[0] || "/";

export function summarize({ events = [], exchanges = [] }) {
  // Versão 0.5: chaves do navegador que guardam o token de login (só nomes).
  const tokens = [];
  for (const e of events)
    if (e.tipo === "armazenamento" && Array.isArray(e.chaves))
      for (const c of e.chaves)
        if (c && ["localStorage", "sessionStorage"].includes(c.onde) && /^[\w.:-]{1,80}$/.test(c.chave || "") && /^[\w.]{0,40}$/.test(c.campo || "") && !tokens.some((t) => t.onde === c.onde && t.chave === c.chave && t.campo === (c.campo || "")))
          tokens.push({ onde: c.onde, chave: c.chave, campo: c.campo || "" });
  const pages = new Map();
  const forms = new Map();
  const sequence = [];
  for (const e of events) {
    if (e.tipo === "pagina" && typeof e.url === "string") {
      const href = pathOnly(e.url);
      if (sequence.at(-1) !== href) sequence.push(href);
      const prev = pages.get(href);
      pages.set(href, {
        href,
        titulo: String(e.h1 || e.titulo || href).slice(0, 120),
        tituloAba: String(e.titulo || "").slice(0, 120),
        descricao: String(e.descricao || e.texto || "").slice(0, 300),
        termos: (Array.isArray(e.cabecalhos) ? e.cabecalhos : []).filter((h) => h && h !== e.h1).slice(0, 10).join(", ").slice(0, 400),
        visitas: (prev?.visitas || 0) + 1,
        urls: [...new Set([...(prev?.urls || []), e.url])].slice(0, 20),
      });
    }
    if (e.tipo === "formulario" && Array.isArray(e.campos)) {
      const key = `${pathOnly(e.pagina)}|${e.botao}|${e.titulo}`;
      forms.set(key, { pagina: pathOnly(e.pagina), titulo: String(e.titulo || "").slice(0, 80), botao: String(e.botao || "").slice(0, 60), metodo: e.metodo, campos: e.campos.slice(0, 20) });
    }
  }
  const transitions = new Map();
  for (let i = 1; i < sequence.length; i++) {
    const k = `${sequence[i - 1]} → ${sequence[i]}`;
    transitions.set(k, (transitions.get(k) || 0) + 1);
  }

  // Busca: URL de página (ou de API) com parâmetro de busca.
  const searchFrom = (url) => {
    const u = new URL(url, "http://x");
    const key = [...u.searchParams.keys()].find((k) => SEARCH_KEYS.includes(k.toLowerCase()));
    return key ? { modelo: `${u.pathname}?${key}={termo}`, exemplo: u.searchParams.get(key) } : null;
  };
  const buscas = [];
  for (const p of pages.values()) for (const url of p.urls) {
    const s = searchFrom(url);
    if (s && !buscas.some((b) => b.modelo === s.modelo)) buscas.push({ ...s, origem: "pagina" });
  }

  const login = [...pages.values()].find((p) => LOGIN.test(p.href))?.href || [...forms.values()].find((f) => f.campos.some((c) => c.tipo === "password"))?.pagina || "";

  const listas = [];
  const acoes = [];
  let needsLogin = false;
  for (const x of exchanges) {
    // A própria base do agente (widget lendo conhecimento/*.json) não é dado do site.
    if (/\/conhecimento\/[\w-]+\.json$/.test(x.caminho) || x.caminho.startsWith("/__agente-gerador/")) continue;
    if (x.metodo !== "GET") {
      if (!acoes.some((a) => a.metodo === x.metodo && a.caminho === x.caminho)) acoes.push({ metodo: x.metodo, caminho: x.caminho, campos: x.camposEnviados, status: x.status });
      continue;
    }
    if (x.status === 401 || x.status === 403) needsLogin = true;
    if (x.status !== 200 || x.resposta === undefined) continue;
    const items = listOf(x.resposta).filter((i) => i && typeof i === "object" && !Array.isArray(i));
    if (!items.length) continue;
    const fields = lookupFields(items[0]);
    const catalog = mapItems(items, x.caminho, {}, 2);
    if (listas.some((l) => l.caminho === x.caminho)) continue;
    listas.push({ caminho: x.caminho, original: x.original, query: x.query, comSessao: x.comSessao, autenticacao: x.autenticacao || "", itens: items.length, status: Boolean(fields.status), campos: fields, catalogo: catalog ? { campos: catalog.campos, exemplo: catalog.itens.slice(0, 3).map((i) => i.nome) } : null, itensMapeados: catalog?.itens || [] });
    if (x.query.length) {
      const s = searchFrom(`${x.original}?${new URLSearchParams(x.exemploQuery)}`);
      if (s && !buscas.some((b) => b.modelo === s.modelo)) buscas.push({ ...s, origem: "api" });
    }
  }
  return {
    paginas: [...pages.values()],
    formularios: [...forms.values()],
    caminhos: [...transitions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => ({ caminho: k, vezes: n })),
    buscas,
    login,
    listas,
    acoes,
    precisaLogin: needsLogin,
    tokens,
  };
}

const labelFor = (path) => {
  const seg = normalize(path.split("/").filter((s) => s && s !== ":id" && s !== "api").at(-1) || "");
  return LABELS.find(([re]) => re.test(seg))?.[1] || (seg ? seg.replace(/[-_]/g, " ") : "registros");
};
// Pergunta e resposta a partir de um formulário realmente enviado.
export function formFaq(form, pageTitle) {
  const button = form.botao && !GENERIC_BUTTON.test(normalize(form.botao)) ? form.botao : "";
  const subject = button ? button.toLowerCase() : `preencher “${form.titulo || pageTitle}”`;
  const required = form.campos.filter((c) => c.obrigatorio && c.tipo !== "password");
  const shown = (required.length ? required : form.campos).filter((c) => c.tipo !== "password").map((c) => c.rotulo).filter(Boolean).slice(0, 8);
  const pwd = form.campos.some((c) => c.tipo === "password");
  const steps = [shown.length ? `preencha ${joinList(shown.map((s) => s.toLowerCase()))}` : "", pwd ? "informe a senha" : ""].filter(Boolean);
  return {
    pergunta: `Como faço para ${subject}?`.slice(0, 300),
    resposta: `Em “${pageTitle}”, ${steps.length ? `${joinList(steps)} e ` : ""}toque em “${form.botao || "Enviar"}”.`,
    termos: [form.titulo, form.botao, ...shown].filter(Boolean).join(" ").slice(0, 300),
    link: form.pagina,
  };
}

/**
 * Junta a observação à base atual sem apagar nada do que existe. Devolve { knowledge, changes }.
 */
export function applyObservation(base, obs) {
  const k = structuredClone(base);
  k.paginas ||= [];
  k.faq ||= [];
  k.fluxos ||= [];
  k.consultas = { login: "", buscas: [], dados: [], ...(k.consultas || {}) };
  k.catalogo ||= { rotulo: "itens", itens: [] };
  const changes = { paginas: [], faq: [], buscas: [], dados: [], login: "", catalogo: "", linkModelo: "" };

  const known = new Set(k.paginas.map((p) => p.href));
  for (const p of obs.paginas) {
    if (known.has(p.href) || /^\/__agente-gerador/.test(p.href)) {
      const existing = k.paginas.find((x) => x.href === p.href);
      if (existing && !existing.descricao && p.descricao) existing.descricao = p.descricao.slice(0, 300);
      continue;
    }
    k.paginas.push({ titulo: p.titulo, href: p.href, descricao: p.descricao.slice(0, 300), termos: p.termos });
    known.add(p.href);
    changes.paginas.push(p.href);
  }
  const pageTitle = (href) => k.paginas.find((p) => p.href === href)?.titulo || href;
  const faqKeys = new Set(k.faq.map((f) => normalize(f.pergunta)));
  for (const form of obs.formularios) {
    if (!form.campos.length || form.metodo === "get") continue;
    const f = formFaq(form, pageTitle(form.pagina));
    if (faqKeys.has(normalize(f.pergunta))) continue;
    faqKeys.add(normalize(f.pergunta));
    k.faq.push(f);
    changes.faq.push(f.pergunta);
  }
  if (!k.consultas.buscas.length && obs.buscas.length) {
    const b = obs.buscas.find((x) => x.origem === "pagina") || obs.buscas[0];
    k.consultas.buscas.push({ id: "busca-do-site", rotulo: "site", modelo: b.modelo, exemplos: [] });
    changes.buscas.push(b.modelo);
  }
  if (!k.consultas.login && obs.login) {
    k.consultas.login = obs.login;
    changes.login = obs.login;
  }
  // Lista com status lida com a sessão da pessoa = dados da conta (pedidos, agendamentos...).
  for (const l of obs.listas.filter((x) => x.status && x.comSessao && !x.caminho.includes(":id") && !/admin/i.test(x.caminho))) {
    if (k.consultas.dados.some((d) => d.url === l.original)) continue;
    const rotulo = labelFor(l.caminho);
    k.consultas.dados.push({
      id: normalize(rotulo).replace(/[^a-z0-9]+/g, "_"),
      rotulo,
      url: l.original,
      exemplos: EXAMPLES[rotulo] || [`ver meus ${rotulo}`, `status dos meus ${rotulo}`, `quero consultar meus ${rotulo}`],
      campos: Object.fromEntries(Object.entries(l.campos).filter(([, v]) => v)),
      pagina: obs.paginas.find((p) => normalize(p.href).includes(normalize(rotulo).slice(0, 5)) || /conta|account|perfil/.test(p.href))?.href || "",
    });
    changes.dados.push(`${rotulo} (${l.original})`);
  }
  // Versão 0.5: a conta usa token no navegador (Authorization: Bearer). O widget passa a ler o
  // token da mesma chave que o site usa (só o nome da chave vai para a base, nunca o valor).
  const bearer = obs.listas.some((l) => l.autenticacao === "bearer" && l.status);
  if (bearer && obs.tokens?.length && !k.consultas.auth) {
    const t = obs.tokens[0];
    k.consultas.auth = { tipo: "bearer", onde: t.onde, chave: t.chave, ...(t.campo ? { campo: t.campo } : {}) };
    changes.auth = `token em ${t.onde}["${t.chave}"]${t.campo ? `.${t.campo}` : ""}`;
  }
  // Catálogo da API: só quando a base ainda não tem catálogo.
  const candidate = obs.listas.filter((l) => l.catalogo && !l.status && !l.caminho.includes(":id") && !/admin/i.test(l.caminho)).sort((a, b) => b.itens - a.itens)[0];
  if (candidate && !k.catalogo.itens?.length && !k.catalogo.url) {
    k.catalogo.url = candidate.original;
    changes.catalogo = candidate.original;
    // Página de item visitada com o id na URL ("/produto.html?id=abc") vira o modelo do link.
    const ids = new Set(candidate.itensMapeados.map((i) => String(i.id)).filter(Boolean));
    for (const p of obs.paginas)
      for (const url of p.urls) {
        const u = new URL(url, "http://x");
        const param = [...u.searchParams.entries()].find(([, v]) => ids.has(v));
        const seg = u.pathname.split("/").find((s) => ids.has(decodeURIComponent(s)));
        if (param && !k.catalogo.linkModelo) k.catalogo.linkModelo = `${u.pathname}?${param[0]}={id}`;
        else if (seg && !k.catalogo.linkModelo) k.catalogo.linkModelo = u.pathname.replace(seg, "{id}");
      }
    if (k.catalogo.linkModelo) changes.linkModelo = k.catalogo.linkModelo;
  }
  return { knowledge: k, changes };
}

export function observationText(obs, changes, { minutos } = {}) {
  const lines = [
    `Observação do site${minutos ? ` (${minutos} min)` : ""} - ${new Date().toLocaleString("pt-BR")}`,
    "",
    `Páginas vistas: ${obs.paginas.length}. Formulários enviados: ${obs.formularios.length}. Chamadas de API com dados: ${obs.listas.length}.`,
    "",
    "O agente aprendeu:",
    ...(changes.paginas.length ? [`- ${changes.paginas.length} página(s) nova(s): ${changes.paginas.slice(0, 10).join(", ")}`] : []),
    ...changes.faq.map((f) => `- Pergunta nova: ${f}`),
    ...(changes.buscas.length ? [`- Busca do site: ${changes.buscas[0]} (o agente monta o link com o termo)`] : []),
    ...(changes.login ? [`- Página de login: ${changes.login}`] : []),
    ...(changes.auth ? [`- Consultas com login por token: ${changes.auth}`] : []),
    ...changes.dados.map((d) => `- Consulta da conta: ${d}`),
    ...(changes.catalogo ? [`- Catálogo lido da API: ${changes.catalogo}${changes.linkModelo ? ` (link de cada item: ${changes.linkModelo})` : ""}`] : []),
    ...(Object.values(changes).every((v) => !v || (Array.isArray(v) && !v.length)) ? ["- Nada novo desta vez (a base já cobria o que foi visto)."] : []),
    "",
    "Caminhos mais usados:",
    ...(obs.caminhos.length ? obs.caminhos.slice(0, 8).map((c) => `- ${c.caminho} (${c.vezes}x)`) : ["- (navegue por mais páginas na próxima vez)"]),
    "",
    "Ações que mudam dados (o agente NÃO executa; só indica a página):",
    ...(obs.acoes.length ? obs.acoes.slice(0, 15).map((a) => `- ${a.metodo} ${a.caminho}${a.campos.length ? ` (campos: ${a.campos.join(", ")})` : ""}`) : ["- nenhuma vista"]),
    "",
    "Dica: entre na sua conta durante a observação e abra páginas como Meus pedidos; assim o agente aprende a consultar a conta de quem estiver logado.",
  ];
  return `${lines.join("\n")}\n`;
}
