// Treino (versão 0.3): correções feitas pela pessoa no próprio site, durante o comando treinar,
// viram mudanças na base. Funções puras: recebem a base e devolvem a base nova + o que mudou.
import { normalize } from "../agent/text.js";

const str = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const slug = (v) =>
  normalize(v)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

// O que aparece no "Era outra resposta" do modo treino.
export function trainingBase(k) {
  return {
    intencoes: Object.entries(k.intencoes || {}).map(([id, v]) => ({ id, exemplo: v.exemplos?.[0] || id })),
    faq: (k.faq || []).map((f) => ({ id: f.id || slug(f.pergunta), pergunta: f.pergunta, resposta: f.resposta })),
    fluxos: (k.fluxos || []).map((f) => ({ id: f.id || slug(f.pergunta), pergunta: f.pergunta })),
  };
}

/**
 * body: { pergunta, tipo, alvo, resposta, link, etapa, opcoes: [{ rotulo, resposta }] }
 * tipo: "intencao" | "faq" | "fluxo-gatilho" (a resposta certa já existe: aprende a frase)
 *       "editar" (troca o texto de uma resposta da FAQ) | "nova" (pergunta nova na FAQ)
 *       "fluxo" (pergunta antes de responder: conversa em etapas)
 */
export function applyCorrection(base, body = {}) {
  const k = structuredClone(base);
  k.intencoes ||= {};
  k.faq ||= [];
  k.fluxos ||= [];
  const pergunta = str(body.pergunta, 200);
  if (pergunta.length < 2) throw new Error("Falta a pergunta que foi feita ao agente.");
  const faqById = (id) => k.faq.find((f) => (f.id || slug(f.pergunta)) === id);
  switch (body.tipo) {
    case "intencao": {
      const it = k.intencoes[body.alvo];
      if (!it) throw new Error("Intenção não encontrada.");
      if (!it.exemplos.some((e) => normalize(e) === normalize(pergunta))) it.exemplos.push(pergunta);
      return { knowledge: k, mudanca: `“${pergunta}” agora é exemplo da intenção ${body.alvo}.` };
    }
    case "faq": {
      const f = faqById(body.alvo);
      if (!f) throw new Error("Pergunta da FAQ não encontrada.");
      const words = new Set(normalize(f.termos || "").split(/\s+/).filter(Boolean));
      const extra = normalize(pergunta).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !words.has(w));
      f.termos = [f.termos, ...extra].filter(Boolean).join(" ").slice(0, 300);
      f.id ||= slug(f.pergunta);
      return { knowledge: k, mudanca: `“${pergunta}” agora leva à resposta de “${f.pergunta}”.` };
    }
    case "editar": {
      const f = faqById(body.alvo);
      const resposta = str(body.resposta, 1200);
      if (!f || resposta.length < 2) throw new Error("Escolha a pergunta e escreva a resposta nova.");
      f.resposta = resposta;
      return { knowledge: k, mudanca: `Resposta de “${f.pergunta}” atualizada.` };
    }
    case "nova": {
      const resposta = str(body.resposta, 1200);
      if (resposta.length < 2) throw new Error("Escreva a resposta certa.");
      if (k.faq.some((f) => normalize(f.pergunta) === normalize(pergunta))) throw new Error("Essa pergunta já está na FAQ: use “Corrigir o texto”.");
      k.faq.push({ id: slug(pergunta), pergunta, resposta, termos: "", link: str(body.link, 300) });
      return { knowledge: k, mudanca: `Pergunta nova na FAQ: “${pergunta}”.` };
    }
    case "fluxo-gatilho": {
      const f = k.fluxos.find((x) => x.id === body.alvo);
      if (!f) throw new Error("Conversa em etapas não encontrada.");
      if (!f.gatilhos.some((g) => normalize(g) === normalize(pergunta))) f.gatilhos.push(pergunta);
      return { knowledge: k, mudanca: `“${pergunta}” agora abre a conversa “${f.pergunta}”.` };
    }
    case "fluxo": {
      const etapa = str(body.etapa, 400);
      const opcoes = (Array.isArray(body.opcoes) ? body.opcoes : [])
        .map((o) => ({ rotulo: str(o?.rotulo, 60), resposta: str(o?.resposta, 1200), acoes: [] }))
        .filter((o) => o.rotulo && o.resposta)
        .slice(0, 8);
      if (!etapa || opcoes.length < 2) throw new Error("Escreva a pergunta do agente e pelo menos 2 opções com resposta.");
      let id = slug(etapa) || "fluxo";
      for (let n = 2; k.fluxos.some((f) => f.id === id); n++) id = `${slug(etapa)}-${n}`;
      // Dois gatilhos: a frase como veio e a versão sem pontuação (o mínimo que a base exige).
      const plain = normalize(pergunta).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
      k.fluxos.push({ id, gatilhos: [pergunta, plain === pergunta ? `${plain} por favor` : plain], pergunta: etapa, opcoes });
      return { knowledge: k, mudanca: `Conversa em etapas criada: “${pergunta}” → “${etapa}” (${opcoes.map((o) => o.rotulo).join(" / ")}).` };
    }
    default:
      throw new Error("Tipo de correção desconhecido.");
  }
}

export function trainingText(log, { antes, depois } = {}) {
  const ok = log.filter((l) => l.tipo === "ok").length;
  const fixes = log.filter((l) => l.tipo === "correcao");
  return [
    `Treino do agente - ${new Date().toLocaleString("pt-BR")}`,
    "",
    `Perguntas testadas: ${log.filter((l) => l.tipo !== "erro").length}. Marcadas como certas: ${ok}. Corrigidas: ${fixes.length}.`,
    ...(antes != null && depois != null ? [`Acerto da base: ${antes}% antes, ${depois}% depois.`] : []),
    "",
    "O que o agente aprendeu:",
    ...(fixes.length ? fixes.map((f) => `- ${f.mudanca}`) : ["- nada novo (tudo certo ou nenhuma correção)"]),
    "",
  ].join("\n");
}
