// Versão 0.4: aprender com o uso real. As frases que o agente não entendeu (do servidor do site,
// do navegador exportado com agente.exportarFaltas() ou de qualquer arquivo) são agrupadas por
// semelhança e cada grupo ganha uma sugestão: virar exemplo de uma intenção, levar a uma pergunta
// frequente que já existe ou virar uma pergunta nova. Nada é aplicado sem confirmação.
import { readFile } from "node:fs/promises";
import { terms } from "../agent/search.js";
import { normalize } from "../agent/text.js";
import { createAgent } from "../agent/agent.js";
import { train, classify } from "../agent/classifier.js";
import { createIndex } from "../agent/search.js";
import { anonymize } from "../agent/privacy.js";

// Aceita JSON (lista de frases ou de { frase }) e JSON Lines (um { frase } por linha).
export function parseMisses(text) {
  const items = [];
  const push = (v) => {
    const frase = typeof v === "string" ? v : v?.frase || v?.mensagem || v?.pergunta;
    if (typeof frase === "string" && frase.trim().length >= 2) items.push({ frase: anonymize(frase), em: v?.em || null });
  };
  const trimmed = String(text || "").trim();
  if (!trimmed) return items;
  try {
    const data = JSON.parse(trimmed);
    for (const v of Array.isArray(data) ? data : data?.faltas || []) push(v);
    return items;
  } catch {
    for (const line of trimmed.split(/\r?\n/)) {
      try {
        push(JSON.parse(line));
      } catch {
        push(line);
      }
    }
    return items;
  }
}
export async function readMissFiles(files) {
  const out = [];
  const used = [];
  for (const f of files) {
    try {
      out.push(...parseMisses(await readFile(f, "utf8")));
      used.push(f);
    } catch {
      /* arquivo ausente: segue */
    }
  }
  return { faltas: out, arquivos: used };
}

const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n);
};
// Frases parecidas (mesmas palavras de conteúdo) caem no mesmo grupo; o grupo mais pedido vem antes.
export function groupMisses(list, { limiar = 0.5 } = {}) {
  const groups = [];
  for (const m of list) {
    const set = new Set(terms(m.frase));
    const key = normalize(m.frase);
    const g = groups.find((x) => x.chave === key || jaccard(x.termos, set) >= limiar);
    if (g) {
      g.vezes++;
      if (!g.exemplos.some((e) => normalize(e) === key) && g.exemplos.length < 5) g.exemplos.push(m.frase);
      for (const t of set) g.termos.add(t);
    } else groups.push({ chave: key, frase: m.frase, vezes: 1, exemplos: [m.frase], termos: set });
  }
  return groups.sort((a, b) => b.vezes - a.vezes).map((g) => ({ frase: g.frase, vezes: g.vezes, exemplos: g.exemplos }));
}

// Para cada grupo: a intenção mais provável e a pergunta frequente ou página mais próxima.
export function suggestFor(groups, raw) {
  const k = createAgent(raw).knowledge;
  const names = Object.keys(k.intencoes);
  const model = names.length >= 2 ? train(Object.fromEntries(names.map((n) => [n, k.intencoes[n].exemplos]))) : null;
  const index = createIndex([
    ...k.faq.map((f) => ({ id: f.id, tipo: "faq", principal: f.pergunta, medio: f.termos, secundario: f.resposta, dados: f })),
    ...k.paginas.map((p) => ({ id: p.id, tipo: "pagina", principal: p.titulo, medio: p.termos, secundario: p.descricao, dados: p })),
  ]);
  return groups.map((g) => {
    const top = model ? classify(model, g.frase)[0] : null;
    const hit = index.search(g.frase, { limit: 1 })[0];
    let sugestao;
    if (hit && hit.ratio >= 0.34) sugestao = { tipo: hit.doc.tipo === "faq" ? "faq" : "pagina", alvo: hit.doc.id, titulo: hit.doc.tipo === "faq" ? hit.doc.dados.pergunta : hit.doc.dados.titulo, ...(hit.doc.tipo === "pagina" ? { href: hit.doc.dados.href } : {}), confianca: Math.round(hit.ratio * 100) / 100 };
    else if (top && top.p >= 0.6) sugestao = { tipo: "intencao", alvo: top.intent, titulo: top.intent, confianca: Math.round(top.p * 100) / 100 };
    else sugestao = { tipo: "nova", alvo: null, titulo: "pergunta nova na FAQ", confianca: 0 };
    return { ...g, sugestao };
  });
}

export function learnText(groups, { arquivos = [] } = {}) {
  if (!groups.length) return `Nenhuma frase não entendida encontrada${arquivos.length ? ` em ${arquivos.join(", ")}` : ""}.\nPara juntar frases: use o agente no modo servidor (faltas.jsonl) ou, no navegador, agente.exportarFaltas().`;
  const label = { faq: "levar à pergunta", pagina: "levar à página", intencao: "virar exemplo da intenção", nova: "criar" };
  const lines = [`Frases que o agente não entendeu: ${groups.reduce((s, g) => s + g.vezes, 0)} em ${groups.length} grupos${arquivos.length ? ` (de ${arquivos.join(", ")})` : ""}.`, ""];
  for (const [i, g] of groups.entries()) {
    lines.push(`${i + 1}. “${g.frase}” (${g.vezes}x)${g.exemplos.length > 1 ? `\n   parecidas: ${g.exemplos.slice(1).map((e) => `“${e}”`).join(", ")}` : ""}`);
    lines.push(`   sugestão: ${label[g.sugestao.tipo]} ${g.sugestao.tipo === "nova" ? g.sugestao.titulo : `“${g.sugestao.titulo}”`}${g.sugestao.confianca ? ` (confiança ${g.sugestao.confianca})` : ""}`);
  }
  lines.push("", "Para aplicar: agent-generator aprender <pasta> --aplicar (pergunta grupo a grupo) ou agent-generator treinar <pasta> (mostra estas frases primeiro).");
  return lines.join("\n");
}

// Correção (formato de src/train/apply.js) para o grupo, conforme a escolha da pessoa.
export function correctionFor(group, escolha, resposta = "") {
  const s = group.sugestao;
  if (escolha === "sugestao" && s.tipo === "intencao") return { pergunta: group.frase, tipo: "intencao", alvo: s.alvo };
  if (escolha === "sugestao" && s.tipo === "faq") return { pergunta: group.frase, tipo: "faq", alvo: s.alvo };
  if (escolha === "sugestao" && s.tipo === "pagina") return { pergunta: group.frase, tipo: "nova", resposta: resposta || `Você encontra isso em “${s.titulo}”.`, link: s.href };
  if (escolha === "nova" || (escolha === "sugestao" && s.tipo === "nova")) return { pergunta: group.frase, tipo: "nova", resposta };
  return null;
}
