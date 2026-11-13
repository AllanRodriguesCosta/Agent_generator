// Reforço opcional com IA. Dois caminhos, ambos gratuitos:
// 1. Manual: o comando "prompt-ia" escreve PROMPT-IA.md (instruções + relatório resumido). A pessoa
//    cola no ChatGPT, Gemini, Copilot, DeepSeek..., salva a resposta (JSON) e roda "aplicar-ia".
// 2. Automático: com GEMINI_API_KEY (plano gratuito do Google AI Studio), "gemini" faz o mesmo.
// A resposta da IA nunca substitui a base: só acrescenta exemplos, perguntas e termos, depois de
// conferida (tamanhos, links, nada de HTML). A IA é instruída a não inventar preço, prazo ou regra.
import { checkKnowledge, safeLink } from "../agent/knowledge.js";
import { normalize } from "../agent/text.js";

export const AI_SCHEMA_EXAMPLE = {
  intencoes: { saudacao: { exemplos: ["eae, tudo certo?"] }, nome_da_intencao_nova: { exemplos: ["frase 1", "frase 2", "frase 3", "frase 4"], respostas: ["resposta curta"], acoes: [{ rotulo: "Abrir página", href: "/pagina" }] } },
  faq: [{ pergunta: "Pergunta que um visitante faria?", resposta: "Resposta usando só fatos do relatório.", termos: "sinônimos palavras-chave", link: "/pagina-relacionada" }],
  paginas: { "id-da-pagina": "sinônimos e jeitos de pedir por essa página" },
};

// Relatório resumido: o que a IA precisa, sem o código do projeto e sem passar do limite de um chat.
export function compactReport(report, knowledge, maxChars = 24000) {
  const data = {
    projeto: report.projeto,
    paginas: knowledge.paginas.map((p) => ({ id: p.id, titulo: p.titulo, href: p.href, descricao: p.descricao, termos: p.termos })),
    formularios: (report.formularios || []).slice(0, 10).map((f) => ({ arquivo: f.arquivo, campos: f.campos, botao: f.botao })),
    rotas: (report.rotas || []).slice(0, 40).map((r) => `${r.metodo} ${r.caminho}`),
    faqAtual: knowledge.faq.map((f) => ({ pergunta: f.pergunta, resposta: f.resposta })),
    intencoesAtuais: Object.fromEntries(Object.entries(knowledge.intencoes).map(([k, v]) => [k, { exemplos: v.exemplos.slice(0, 5), resposta: v.respostas[0] }])),
    catalogo: knowledge.catalogo.itens.length ? { rotulo: knowledge.catalogo.rotulo, total: knowledge.catalogo.itens.length, amostra: knowledge.catalogo.itens.slice(0, 15).map((i) => ({ nome: i.nome, categoria: i.categoria, preco: i.preco })) } : null,
    contatos: report.contatos,
    documentos: (report.documentos || []).slice(0, 8).map((d) => ({ arquivo: d.arquivo, titulo: d.titulo, secoes: d.secoes.slice(0, 15) })),
    palavrasChave: report.palavrasChave,
    // Versão 0.5: mensagens de erro que o site mostra; a IA pode escrever "o que fazer" para cada uma.
    mensagensErro: (report.mensagensErro || []).slice(0, 25),
  };
  let json = JSON.stringify(data, null, 1);
  while (json.length > maxChars && data.documentos.length) {
    data.documentos.pop();
    json = JSON.stringify(data, null, 1);
  }
  return json.slice(0, maxChars);
}

export function buildPrompt(report, knowledge) {
  const site = knowledge.agente.site;
  return `# Tarefa: completar a base de conhecimento do assistente de "${site}"

Você vai ajudar a criar o assistente virtual (chatbot simples, sem IA em tempo real) do site "${site}".
O assistente entende frases por exemplos (classificador de intenções) e responde com textos fixos,
perguntas frequentes e links para as páginas. Abaixo está o RELATÓRIO do projeto, gerado
automaticamente a partir do código.

## O que fazer

1. Para cada intenção existente, escreva de 8 a 15 frases NOVAS que um visitante brasileiro
   escreveria (gírias, abreviações, erros comuns de digitação, frases curtas e longas).
2. Crie de 3 a 6 intenções NOVAS só se o relatório mostrar algo que o visitante faria no site
   (ex.: agendar, matricular, acompanhar pedido, enviar currículo). Cada uma com pelo menos 6
   exemplos, 1 resposta curta e, se houver, uma ação com link de página do relatório.
3. Escreva de 5 a 15 perguntas frequentes com resposta baseada SOMENTE em fatos do relatório.
4. Para cada página, escreva sinônimos e jeitos de pedir por ela.
5. Se o relatório tiver "mensagensErro", escolha até 8 que um visitante pode ver e escreva uma
   pergunta frequente "Apareceu a mensagem “...”. O que faço?" com o que fazer, usando só o que a
   própria mensagem e o relatório dizem.

## Regras obrigatórias

- Português do Brasil, tom simpático e direto; respostas com no máximo 3 frases.
- NUNCA invente preço, prazo, endereço, telefone, política de troca, horário ou qualquer fato que
  não esteja no relatório. Se não houver o dado, não crie a pergunta.
- Links: só caminhos de páginas que aparecem no relatório (campo "href").
- Nada de HTML ou Markdown dentro dos textos.
- Responda APENAS com um bloco JSON válido, neste formato (sem comentários):

\`\`\`json
${JSON.stringify(AI_SCHEMA_EXAMPLE, null, 2)}
\`\`\`

## Relatório do projeto

\`\`\`json
${compactReport(report, knowledge)}
\`\`\`
`;
}

// Extrai o JSON da resposta (com ou sem bloco \`\`\`json).
export function parseAiAnswer(text) {
  const raw = String(text || "");
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidates = [fenced, raw, raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)].filter(Boolean);
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c.trim());
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      /* tenta o próximo */
    }
  }
  throw new Error("A resposta da IA não tem um JSON válido. Peça para ela responder só com o bloco JSON.");
}

const clean = (v, max) => (typeof v === "string" ? v.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, max) : "");

// Junta a sugestão da IA à base. Devolve a base nova e um resumo do que mudou.
export function mergeAi(knowledge, suggestion) {
  const base = structuredClone(knowledge);
  const changes = { exemplos: 0, intencoesNovas: [], faqNovas: 0, paginas: 0, ignorados: [] };
  const known = new Set(base.paginas.map((p) => p.href));
  const okLink = (href) => {
    const link = safeLink(href);
    return link && (known.has(link) || /^https?:\/\//.test(link)) ? link : "";
  };
  for (const [rawName, value] of Object.entries(suggestion?.intencoes || {})) {
    const name = normalize(rawName).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
    const exemplos = (Array.isArray(value?.exemplos) ? value.exemplos : []).map((e) => clean(e, 200)).filter(Boolean);
    if (!name) continue;
    if (base.intencoes[name]) {
      const have = new Set(base.intencoes[name].exemplos.map(normalize));
      for (const e of exemplos)
        if (!have.has(normalize(e)) && base.intencoes[name].exemplos.length < 60) {
          base.intencoes[name].exemplos.push(e);
          have.add(normalize(e));
          changes.exemplos++;
        }
      continue;
    }
    const respostas = (Array.isArray(value?.respostas) ? value.respostas : []).map((r) => clean(r, 600)).filter(Boolean).slice(0, 3);
    if (exemplos.length < 6 || !respostas.length) {
      changes.ignorados.push(`intenção ${name}: precisa de 6+ exemplos e 1 resposta`);
      continue;
    }
    const acoes = (Array.isArray(value?.acoes) ? value.acoes : []).map((a) => ({ rotulo: clean(a?.rotulo, 60), href: okLink(a?.href) })).filter((a) => a.rotulo && a.href).slice(0, 3);
    base.intencoes[name] = { exemplos: exemplos.slice(0, 40), respostas, acoes, sugestoes: [] };
    changes.intencoesNovas.push(name);
  }
  const questions = new Set(base.faq.map((f) => normalize(f.pergunta)));
  for (const f of Array.isArray(suggestion?.faq) ? suggestion.faq : []) {
    const pergunta = clean(f?.pergunta, 300);
    const resposta = clean(f?.resposta, 1200);
    if (!pergunta || !resposta || questions.has(normalize(pergunta))) continue;
    questions.add(normalize(pergunta));
    base.faq.push({ id: "", pergunta, resposta, termos: clean(f?.termos, 300), link: okLink(f?.link), origem: "ia" });
    changes.faqNovas++;
  }
  for (const [id, termos] of Object.entries(suggestion?.paginas || {})) {
    const page = base.paginas.find((p) => p.id === id || p.href === id);
    const extra = clean(termos, 300);
    if (!page || !extra) continue;
    page.termos = [page.termos, extra].filter(Boolean).join(", ").slice(0, 400);
    changes.paginas++;
  }
  const { knowledge: checked, problems } = checkKnowledge(base);
  checked.agente.origem = knowledge.agente.origem;
  for (const f of checked.faq) if (base.faq.find((b) => b.pergunta === f.pergunta)?.origem === "ia") f.origem = "ia";
  return { knowledge: checked, changes, problems };
}

// Gemini (plano gratuito). Sem SDK: fetch nativo. A chave vem do ambiente e nunca é gravada.
export async function askGemini(prompt, { apiKey, model = "gemini-flash-latest", fetchImpl = fetch, timeoutMs = 60000 } = {}) {
  if (!apiKey) throw new Error("Defina GEMINI_API_KEY (chave gratuita em aistudio.google.com).");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, responseMimeType: "application/json" } }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Gemini respondeu ${res.status}. Confira a chave e o limite gratuito.`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text) throw new Error("Gemini não devolveu texto.");
  return text;
}
