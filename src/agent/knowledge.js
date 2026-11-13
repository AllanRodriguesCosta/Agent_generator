// Formato da base de conhecimento (versão 1) e conferência. Tudo é JSON simples, editável à mão:
//   agente.json     nome, textos fixos, limiar de confiança, cor do widget
//   intencoes.json  { nome: { exemplos: [...], respostas: [...], acoes: [{rotulo, href}], sugestoes: [...] } }
//   faq.json        [{ id, pergunta, resposta, termos, link }]
//   paginas.json    [{ id, titulo, href, descricao, termos }]
//   catalogo.json   { rotulo, itens: [{ id, nome, categoria, preco, descricao, link, imagem, tags }] }
//   fluxos.json     [{ id, gatilhos: [...], pergunta, opcoes: [{ rotulo, resposta, acoes, proximo }] }]
//   consultas.json  { login, buscas: [{ id, rotulo, modelo, exemplos }], dados: [{ id, rotulo, url, exemplos, campos, pagina }] }
// A conferência corta o que for grande demais e devolve a lista de problemas encontrados.

export const FILES = ["agente", "intencoes", "faq", "paginas", "catalogo", "fluxos", "consultas"];
export const LIMITS = { texto: 1200, curto: 160, exemplos: 60, respostas: 6, acoes: 4, faq: 400, paginas: 300, itens: 2000, fluxos: 60, opcoes: 8, consultas: 12 };

const str = (v, max = LIMITS.curto) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const list = (v) => (Array.isArray(v) ? v : []);
const slug = (v) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

// Link aceito: caminho do próprio site ("/contato", "#faq", "pagina.html") ou http(s) completo.
export function safeLink(value) {
  const v = str(value, 300);
  if (!v) return "";
  if (/^https?:\/\/[^\s"'<>]+$/i.test(v)) return v;
  if (/^(\/(?!\/)|#|\.{0,2}\/?[\w-])[^\s"'<>:]*$/.test(v) && !/^(javascript|data|vbscript):/i.test(v)) return v;
  return "";
}

function actions(value, problems, where) {
  return list(value)
    .slice(0, LIMITS.acoes)
    .map((a) => ({ rotulo: str(a?.rotulo, 60), href: safeLink(a?.href) }))
    .filter((a) => {
      const ok = a.rotulo && a.href;
      if (!ok) problems.push(`${where}: ação sem rótulo ou com link inválido foi ignorada.`);
      return ok;
    });
}

export function checkKnowledge(input = {}) {
  const problems = [];
  const a = input.agente || {};
  const site = str(a.site, 80) || "o site";
  const agente = {
    versao: 1,
    nome: str(a.nome, 80) || `Assistente de ${site}`,
    site,
    descricao: str(a.descricao, 400),
    idioma: str(a.idioma, 10) || "pt-BR",
    moeda: /^[A-Z]{3}$/.test(a.moeda || "") ? a.moeda : "BRL",
    saudacao: str(a.saudacao, LIMITS.texto) || `Oi! Sou o assistente de ${site}. Como posso ajudar?`,
    naoEntendi: str(a.naoEntendi, LIMITS.texto) || "Não entendi bem. Pode escrever de outro jeito ou escolher uma opção?",
    vazio: str(a.vazio, 200) || "Escreva sua pergunta.",
    sugestoes: list(a.sugestoes).map((s) => str(s, 60)).filter(Boolean).slice(0, 6),
    limiar: Number.isFinite(a.limiar) && a.limiar >= 0.3 && a.limiar <= 0.95 ? a.limiar : 0.55,
    cor: /^#[0-9a-f]{6}$/i.test(a.cor || "") ? a.cor : "#6d28d9",
    posicao: a.posicao === "esquerda" ? "esquerda" : "direita",
    // Opcional: endereço do servidor do agente (modo servidor). Vazio = roda no navegador.
    endpoint: safeLink(a.endpoint),
    // Versão 0.4: para onde o widget manda as frases que não entendeu (servidor do próprio site,
    // ex.: "/api/agente"). Vazio = ficam só neste navegador (agente.faltas() no console).
    registro: (() => {
      const link = safeLink(a.registro);
      return link && !/^https?:/i.test(link) ? link : "";
    })(),
  };

  const intencoes = {};
  const rawIntents = input.intencoes && typeof input.intencoes === "object" && !Array.isArray(input.intencoes) ? input.intencoes : {};
  for (const [name, value] of Object.entries(rawIntents)) {
    const key = slug(name).replace(/-/g, "_");
    if (!key) continue;
    const exemplos = [...new Set(list(value?.exemplos).map((e) => str(e, 200)).filter(Boolean))].slice(0, LIMITS.exemplos);
    const respostas = list(value?.respostas).map((r) => str(r, LIMITS.texto)).filter(Boolean).slice(0, LIMITS.respostas);
    if (exemplos.length < 2) problems.push(`intencoes.${key}: precisa de pelo menos 2 exemplos (tem ${exemplos.length}); ignorada.`);
    else if (!respostas.length) problems.push(`intencoes.${key}: sem resposta; ignorada.`);
    else
      intencoes[key] = {
        exemplos,
        respostas,
        acoes: actions(value?.acoes, problems, `intencoes.${key}`),
        sugestoes: list(value?.sugestoes).map((s) => str(s, 60)).filter(Boolean).slice(0, 4),
      };
  }

  const seen = new Set();
  const uniqueId = (base, prefix) => {
    let id = slug(base) || prefix;
    for (let n = 2; seen.has(id); n++) id = `${slug(base) || prefix}-${n}`;
    seen.add(id);
    return id;
  };

  const faq = list(input.faq)
    .slice(0, LIMITS.faq)
    .map((f, i) => ({
      id: uniqueId(f?.id || f?.pergunta, `faq-${i + 1}`),
      pergunta: str(f?.pergunta, 300),
      resposta: str(f?.resposta, LIMITS.texto),
      termos: str(f?.termos, 300),
      link: safeLink(f?.link),
    }))
    .filter((f) => {
      const ok = f.pergunta && f.resposta;
      if (!ok) problems.push(`faq.${f.id}: pergunta ou resposta vazia; ignorada.`);
      return ok;
    });

  const paginas = list(input.paginas)
    .slice(0, LIMITS.paginas)
    .map((p, i) => ({
      id: uniqueId(p?.id || p?.titulo, `pagina-${i + 1}`),
      titulo: str(p?.titulo, 120),
      href: safeLink(p?.href),
      descricao: str(p?.descricao, 400),
      termos: str(p?.termos, 400),
    }))
    .filter((p) => {
      const ok = p.titulo && p.href;
      if (!ok) problems.push(`paginas.${p.id}: título ou link inválido; ignorada.`);
      return ok;
    });

  // id do item fica como veio (vira link pelo linkModelo); só é criado quando falta ou repete.
  const itemId = (raw, nome, i) => {
    const id = raw == null ? "" : String(raw).trim().slice(0, 80);
    if (!id || seen.has(id)) return uniqueId(nome, `item-${i + 1}`);
    seen.add(id);
    return id;
  };
  const rawCatalog = Array.isArray(input.catalogo) ? { itens: input.catalogo } : input.catalogo || {};
  const itens = list(rawCatalog.itens)
    .slice(0, LIMITS.itens)
    .map((p, i) => {
      const preco = Number(p?.preco);
      return {
        id: itemId(p?.id, p?.nome, i),
        nome: str(p?.nome, 120),
        categoria: str(p?.categoria, 60),
        preco: Number.isFinite(preco) && preco >= 0 ? Math.round(preco * 100) / 100 : null,
        descricao: str(p?.descricao, 300),
        link: safeLink(p?.link),
        imagem: safeLink(p?.imagem),
        tags: list(p?.tags).map((t) => str(t, 40)).filter(Boolean).slice(0, 12),
      };
    })
    .filter((p) => {
      if (!p.nome) problems.push(`catalogo.${p.id}: sem nome; ignorado.`);
      return p.nome;
    });
  // url: o widget lê o catálogo da API do site (lista de objetos); campos força o mapeamento.
  const campos = Object.fromEntries(
    Object.entries(rawCatalog.campos && typeof rawCatalog.campos === "object" ? rawCatalog.campos : {})
      .filter(([k, v]) => typeof v === "string" && /^[\w.-]{1,40}$/.test(v) && /^[a-z]{2,12}$/.test(k)),
  );
  const url = safeLink(rawCatalog.url);
  // linkModelo: endereço de cada item quando a lista não traz link, ex.: "/produto.html?id={id}".
  const linkModelo = safeLink(rawCatalog.linkModelo);
  const catalogo = {
    rotulo: str(rawCatalog.rotulo, 40) || "itens",
    ...(url ? { url } : {}),
    ...(Object.keys(campos).length ? { campos } : {}),
    ...(linkModelo.includes("{id}") ? { linkModelo } : {}),
    itens: linkModelo.includes("{id}") ? itens.map((p) => (p.link ? p : { ...p, link: linkModelo.replace("{id}", encodeURIComponent(p.id)) })) : itens,
  };

  // Conversa em etapas: o agente pergunta antes de responder ("Entrega ou retirada?").
  const flowIds = new Set();
  const fluxos = list(input.fluxos)
    .slice(0, LIMITS.fluxos)
    .map((f, i) => {
      let id = slug(f?.id || f?.pergunta) || `fluxo-${i + 1}`;
      for (let n = 2; flowIds.has(id); n++) id = `${slug(f?.id || f?.pergunta) || `fluxo-${i + 1}`}-${n}`;
      flowIds.add(id);
      return {
        id,
        gatilhos: [...new Set(list(f?.gatilhos).map((g) => str(g, 200)).filter(Boolean))].slice(0, LIMITS.exemplos),
        pergunta: str(f?.pergunta, 400),
        opcoes: list(f?.opcoes)
          .slice(0, LIMITS.opcoes)
          .map((o) => ({ rotulo: str(o?.rotulo, 60), resposta: str(o?.resposta, LIMITS.texto), acoes: actions(o?.acoes, problems, `fluxos.${id}`), proximo: slug(o?.proximo) }))
          .filter((o) => o.rotulo && (o.resposta || o.proximo)),
      };
    })
    .filter((f) => {
      const ok = f.gatilhos.length >= 2 && f.pergunta && f.opcoes.length >= 2;
      if (!ok) problems.push(`fluxos.${f.id}: precisa de 2 gatilhos, uma pergunta e 2 opções; ignorado.`);
      return ok;
    });
  for (const f of fluxos) for (const o of f.opcoes) if (o.proximo && !flowIds.has(o.proximo)) o.proximo = "";

  // Consultas ao vivo: buscas do site (link pronto com o termo) e dados da conta (pedidos,
  // agendamentos...) lidos pelo widget na API do próprio site, com a sessão de quem está logado.
  const rawQ = input.consultas && typeof input.consultas === "object" && !Array.isArray(input.consultas) ? input.consultas : {};
  const sameSite = (v) => {
    const link = safeLink(v);
    return link && !/^https?:/i.test(link) ? link : "";
  };
  const buscas = list(rawQ.buscas)
    .slice(0, LIMITS.consultas)
    .map((b, i) => ({ id: slug(b?.id || b?.rotulo) || `busca-${i + 1}`, rotulo: str(b?.rotulo, 60) || "site", modelo: sameSite(b?.modelo), exemplos: list(b?.exemplos).map((e) => str(e, 200)).filter(Boolean).slice(0, LIMITS.exemplos) }))
    .filter((b) => {
      const ok = b.modelo.includes("{termo}");
      if (!ok) problems.push(`consultas.buscas.${b.id}: modelo precisa de {termo} e ser do próprio site; ignorada.`);
      return ok;
    });
  const dados = list(rawQ.dados)
    .slice(0, LIMITS.consultas)
    .map((d, i) => ({
      id: slug(d?.id || d?.rotulo).replace(/-/g, "_") || `dados_${i + 1}`,
      rotulo: str(d?.rotulo, 60) || "registros",
      url: sameSite(d?.url),
      exemplos: [...new Set(list(d?.exemplos).map((e) => str(e, 200)).filter(Boolean))].slice(0, LIMITS.exemplos),
      campos: Object.fromEntries(Object.entries(d?.campos && typeof d.campos === "object" ? d.campos : {}).filter(([k, v]) => /^[a-z]{2,12}$/.test(k) && typeof v === "string" && /^[\w.-]{1,40}$/.test(v))),
      pagina: safeLink(d?.pagina),
    }))
    .filter((d) => {
      const ok = d.url && d.exemplos.length >= 2;
      if (!ok) problems.push(`consultas.dados.${d.id}: precisa de url do próprio site e 2 exemplos; ignorada.`);
      return ok;
    });
  const consultas = { login: safeLink(rawQ.login), buscas, dados };

  if (!Object.keys(intencoes).length && !faq.length && !paginas.length && !itens.length && !url && !fluxos.length)
    problems.push("Base vazia: o agente só vai cumprimentar e pedir outra pergunta.");
  return { knowledge: { agente, intencoes, faq, paginas, catalogo, fluxos, consultas }, problems };
}
