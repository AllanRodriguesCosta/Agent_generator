// Transforma o relatório do raio X em base de conhecimento (os moldes do agente). Só usa o que
// foi encontrado no projeto: nada de preço, prazo ou regra inventados. Textos genéricos (como
// cumprimentar ou pedir ajuda) vêm prontos e citam o nome do site.
import { checkKnowledge } from "../agent/knowledge.js";
import { normalize } from "../agent/text.js";

const uniq = (a) => [...new Set(a.filter(Boolean))];
const has = (re, ...values) => values.some((v) => re.test(normalize(v)));
const LOGIN = /\b(login|entrar|acessar conta|minha conta|sign ?in|log ?in|cadastr|criar conta|registr|sign ?up)/;
const CONTACT = /\b(contato|fale conosco|atendimento|suporte|contact|ajuda|help|sac|ouvidoria)\b/;
const HELP_PAGE = /\b(ajuda|faq|perguntas|duvidas|help|central)\b/;

// "Cardápio | Café Aurora" → "Cardápio" (tira o nome do site do título).
export function cleanTitle(title, site) {
  const parts = String(title || "").split(/\s+[|–—·-]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return String(title || "").trim();
  const rest = parts.filter((p) => normalize(p) !== normalize(site));
  return (rest.length ? rest : parts).join(" - ");
}

function catalogLabel(fonte = "", itens = []) {
  const f = normalize(fonte);
  if (/servic/.test(f)) return "serviços";
  if (/curso|aula|course/.test(f)) return "cursos";
  if (/cardapio|menu|prato/.test(f)) return "itens do cardápio";
  if (/imove|propert/.test(f)) return "imóveis";
  if (/livro|book/.test(f)) return "livros";
  if (/evento|event/.test(f)) return "eventos";
  return itens.some((i) => i.preco != null) ? "produtos" : "itens";
}

export function baseIntents({ site, contactText, contactPage, whatsapp, helpPage, loginPage, catalogLabel: label, faqChips }) {
  const intents = {
    saudacao: {
      exemplos: ["oi", "olá", "ola", "oie", "bom dia", "boa tarde", "boa noite", "e aí", "opa", "oi tudo bem", "olá, tudo bem?", "hey", "salve", "oi, boa tarde"],
      respostas: [`Oi! Sou o assistente virtual de ${site}. Em que posso ajudar?`, "Olá! Me conta o que você procura."],
      sugestoes: faqChips,
    },
    despedida: {
      exemplos: ["tchau", "até mais", "ate logo", "até a próxima", "tchau, obrigado", "fui", "flw", "até breve", "pode encerrar"],
      respostas: ["Até mais! Se precisar, é só chamar.", "Tchau! Volte quando quiser."],
    },
    agradecimento: {
      exemplos: ["obrigado", "obrigada", "valeu", "muito obrigado", "agradeço", "brigado", "show, obrigado", "perfeito, valeu", "ajudou muito", "obg", "vlw"],
      respostas: ["Por nada! Posso ajudar em mais alguma coisa?", "Que bom que ajudou! Precisando, estou aqui."],
    },
    sobre_bot: {
      exemplos: ["quem é você", "o que você faz", "você é um robô", "você é humano", "como você funciona", "o que posso te perguntar", "você é uma ia", "com quem estou falando", "pra que serve esse chat", "o que você sabe fazer"],
      respostas: [
        `Sou o assistente virtual de ${site}. Respondo dúvidas frequentes, mostro onde fica cada página${label ? ` e ajudo a encontrar ${label} (dá para dizer quanto quer gastar)` : ""}. Para falar com uma pessoa, peça "atendimento".`,
      ],
      sugestoes: faqChips,
    },
    ajuda: {
      exemplos: ["ajuda", "preciso de ajuda", "me ajuda", "socorro", "help", "tive um problema", "não estou conseguindo", "deu erro", "está dando erro", "não funciona", "algo deu errado", "estou com dificuldade", "pode me ajudar?"],
      respostas: ["Claro! Me conta o que aconteceu, com suas palavras, ou escolha um assunto abaixo."],
      acoes: [helpPage && { rotulo: "Central de ajuda", href: helpPage }, contactPage && { rotulo: "Falar com o atendimento", href: contactPage }].filter(Boolean),
      sugestoes: faqChips,
    },
    contato: {
      exemplos: ["quero falar com um atendente", "falar com uma pessoa", "contato", "qual o telefone", "qual o email de vocês", "tem whatsapp?", "como entro em contato", "atendimento humano", "suporte", "falar com o suporte", "quero reclamar", "qual o endereço da loja", "endereço de vocês"],
      respostas: [contactText],
      acoes: [whatsapp && { rotulo: "Chamar no WhatsApp", href: whatsapp }, contactPage && { rotulo: "Abrir contato", href: contactPage }].filter(Boolean),
    },
  };
  if (loginPage)
    intents.conta = {
      exemplos: ["como faço login", "quero entrar na minha conta", "criar conta", "como me cadastro", "esqueci minha senha", "não consigo entrar", "fazer cadastro", "minha conta", "como crio uma conta", "login"],
      respostas: ["Você entra ou cria sua conta pela página de acesso (botão abaixo)."],
      acoes: [{ rotulo: "Entrar ou criar conta", href: loginPage }],
    };
  if (label)
    intents.catalogo_ajuda = {
      exemplos: ["quero comprar", "o que vocês vendem", "quais produtos vocês têm", "me indica algo", "me recomenda", "quero ver o catálogo", "o que tem de bom", "tem promoção?", "me ajuda a escolher", "quais opções vocês têm"],
      respostas: [`Posso te ajudar a encontrar ${label}. Diga o que procura e, se quiser, quanto quer gastar (por exemplo: "até R$ 100").`],
    };
  return intents;
}

export function generateKnowledge(report) {
  const site = report.projeto?.site || report.projeto?.nome || "o site";
  const pagesRaw = report.paginas || [];
  const links = report.links || [];
  const internal = (href) => href && !/^https?:\/\//i.test(href) && !href.startsWith("#");
  const norm = (href) => (internal(href) ? `/${href.replace(/^\.?\//, "")}`.replace(/\/index\.html?$/, "/") : href);

  const pages = new Map();
  for (const p of pagesRaw) {
    const href = norm(p.href);
    const linkTexts = links.filter((l) => norm(l.href) === href).map((l) => l.texto);
    const titulo = cleanTitle(p.titulo, site) || linkTexts[0] || href;
    pages.set(href, {
      titulo: href === "/" ? `Início (${site})` : titulo,
      href,
      descricao: p.descricao || "",
      termos: uniq([...linkTexts, ...(p.secoes || [])].filter((t) => normalize(t) !== normalize(titulo))).join(", ").slice(0, 400),
    });
  }
  // Destinos que só aparecem como link (página dinâmica, rota de framework).
  for (const l of links)
    if (internal(l.href) && !pages.has(norm(l.href)) && !/\.(png|jpe?g|svg|pdf|zip|css|js)$/i.test(l.href) && pages.size < 300)
      pages.set(norm(l.href), { titulo: l.texto, href: norm(l.href), descricao: "", termos: "" });
  const paginas = [...pages.values()];
  const find = (re) => paginas.find((p) => has(re, p.titulo, p.href, p.termos))?.href || "";
  const contactPage = find(CONTACT);
  const helpPage = paginas.find((p) => has(HELP_PAGE, p.titulo, p.href) && p.href !== contactPage)?.href || "";
  const loginPage = find(LOGIN);

  const c = report.contatos || {};
  const contactParts = [
    c.emails?.[0] && `e-mail ${c.emails[0]}`,
    c.whatsapp?.[0] ? "WhatsApp (botão abaixo)" : c.telefones?.[0] && `telefone/WhatsApp ${c.telefones[0]}`,
  ].filter(Boolean);
  const contactText = contactParts.length
    ? `Você fala com a equipe de ${site} por ${contactParts.join(" ou ")}.${c.horario?.[0] ? ` Atendimento: ${c.horario[0]}.` : ""}`
    : contactPage
      ? `Você fala com a equipe de ${site} pela página de contato.`
      : `Ainda não tenho os contatos de ${site}. Procure "Contato" no menu do site.`;

  const faqSeen = new Set();
  const faq = (report.faq || [])
    .filter((f) => {
      const k = normalize(f.pergunta);
      if (faqSeen.has(k)) return false;
      faqSeen.add(k);
      return true;
    })
    .map((f) => ({ pergunta: f.pergunta, resposta: f.resposta, termos: "", link: f.link || "" }));
  if (c.horario?.[0] && !faq.some((f) => /horario/.test(normalize(f.pergunta))))
    faq.push({ pergunta: "Qual o horário de atendimento?", resposta: `${c.horario[0]}.`, termos: "horário funcionamento abre fecha aberto", link: contactPage });

  const catalog = report.catalogo;
  const label = catalog ? catalogLabel(catalog.fonte, catalog.itens) : report.catalogoApi ? "produtos" : "";
  const catalogo = catalog
    ? { rotulo: label, itens: catalog.itens.map((i) => ({ ...i, link: i.link && /^(\/|https?:)/.test(i.link) ? i.link : "" })) }
    : { rotulo: label || "itens", ...(report.catalogoApi ? { url: report.catalogoApi } : {}), ...(report.linkModelo ? { linkModelo: report.linkModelo } : {}), itens: [] };

  const faqChips = faq.slice(0, 3).map((f) => f.pergunta.slice(0, 60));
  const intencoes = baseIntents({ site, contactText, contactPage, whatsapp: c.whatsapp?.[0] || "", helpPage, loginPage, catalogLabel: label, faqChips });
  const sugestoes = uniq([...faqChips.slice(0, 2), label && `Ver ${label}`, (contactPage || contactParts.length) && "Falar com o atendimento"]).slice(0, 4);

  const agente = {
    versao: 1,
    nome: `Assistente ${site}`.slice(0, 80),
    site,
    descricao: report.projeto?.descricao || "",
    idioma: "pt-BR",
    moeda: "BRL",
    saudacao: `Oi! Sou o assistente virtual de ${site}. Posso tirar dúvidas, mostrar onde fica cada página${label ? ` e ajudar a encontrar ${label}` : ""}.`,
    naoEntendi: `Não entendi bem. Pode escrever de outro jeito? Se preferir, escolha uma opção${contactPage || contactParts.length ? " ou fale com o atendimento" : ""}.`,
    vazio: "Escreva sua pergunta.",
    sugestoes,
    limiar: 0.55,
    cor: "#6d28d9",
    posicao: "direita",
    origem: { gerador: "agent-generator", relatorio: report.geradoEm || "", stack: report.projeto?.stack || [] },
  };
  // Consultas: o login vem do raio X; buscas e dados da conta são confirmados pela observação
  // (comando observar), que vê as chamadas reais do site.
  const consultas = { login: loginPage, buscas: [], dados: [] };
  const { knowledge, problems } = checkKnowledge({ agente, intencoes, faq, paginas, catalogo, fluxos: [], consultas });
  knowledge.agente.origem = agente.origem;
  const notes = [...(report.avisos || []), ...problems];
  if (!contactPage && !contactParts.length) notes.push("Sem contato encontrado: edite intencoes.json > contato > respostas.");
  return { knowledge, notes };
}
