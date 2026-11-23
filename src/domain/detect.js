// Detecção do setor do site (versão 0.7). Conta os sinais de cada base setorial no texto do
// projeto (títulos e seções valem o dobro do corpo) e nos tipos schema.org encontrados, e devolve
// o ranking com as evidências. Sem IA: só contagem ponderada, explicável no relatório.
import { normalize } from "../agent/text.js";
import { SECTORS, GENERIC } from "./sectors.js";

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = new Map();
const patternFor = (term) => {
  if (!patterns.has(term)) {
    const exact = term.endsWith("!");
    const base = escape(exact ? term.slice(0, -1) : term).replace(/ /g, "[\\s-]+");
    patterns.set(term, new RegExp(`(?:^|[^a-z0-9])${base}${exact ? "s?(?![a-z0-9])" : "[a-z0-9]*"}`, "g"));
  }
  return patterns.get(term);
};

// Pontuação mínima para confiar num setor e quanto ele precisa superar o segundo colocado.
export const MIN_SCORE = 8;
export const MARGIN = 1.25;

/**
 * texts: { destaque: string[] (títulos, seções, nomes), corpo: string[], schema: string[] (tipos) }
 * Devolve { setor, secundario, ranking: [{ id, nome, pontos, evidencias }] }.
 */
export function detectSector({ destaque = [], corpo = [], schema = [] } = {}, { forcar } = {}) {
  const strong = ` ${normalize(destaque.join(" \n "))} `;
  const body = ` ${normalize(corpo.join(" \n ")).slice(0, 200000)} `;
  const types = new Set(schema.map((t) => String(t).replace(/^https?:\/\/schema\.org\//, "")));
  const ranking = SECTORS.map((s) => {
    let pontos = 0;
    const evidencias = [];
    for (const [term, peso] of s.sinais) {
      const re = patternFor(term);
      const count = (strong.match(re) || []).length * 2 + (body.match(re) || []).length;
      if (!count) continue;
      const gain = peso * Math.log2(1 + count);
      pontos += gain;
      evidencias.push({ termo: term, vezes: count, gain });
    }
    for (const t of s.schema)
      if (types.has(t)) {
        pontos += 6;
        evidencias.push({ termo: `schema.org/${t}`, vezes: 1, gain: 6 });
      }
    evidencias.sort((a, b) => b.gain - a.gain);
    return { id: s.id, nome: s.nome, pontos: Math.round(pontos * 10) / 10, evidencias: evidencias.slice(0, 6).map((e) => `${e.termo.replace(/!$/, "")} (${e.vezes}x)`) };
  }).sort((a, b) => b.pontos - a.pontos);

  if (forcar) {
    const chosen = SECTORS.find((s) => s.id === forcar) || (forcar === "geral" ? GENERIC : null);
    if (chosen) return { setor: chosen.id, secundario: "", confianca: 1, forcado: true, ranking };
  }
  const [first, second] = ranking;
  const ok = first && first.pontos >= MIN_SCORE && first.pontos >= (second?.pontos || 0) * MARGIN;
  // Site misto (ex.: loja de instrumentos que também ensina): o segundo entra se chegar perto.
  const close = (x) => x && x.pontos >= MIN_SCORE && x.pontos >= first.pontos * 0.7;
  const confianca = first && first.pontos ? Math.min(1, Math.round((first.pontos / (first.pontos + (second?.pontos || 0))) * 100) / 100) : 0;
  if (ok) return { setor: first.id, secundario: close(second) ? second.id : "", confianca, forcado: false, ranking };
  // Empate técnico entre dois setores fortes: fica com os dois (o primeiro como principal).
  if (first && first.pontos >= MIN_SCORE && close(second)) return { setor: first.id, secundario: second.id, confianca, forcado: false, ranking };
  return { setor: "geral", secundario: "", confianca: 0, forcado: false, ranking };
}

// Texto do relatório do raio X separado em destaque e corpo, para a detecção.
export function textsFromReport(report = {}) {
  const pages = report.paginas || [];
  return {
    destaque: [
      report.projeto?.nome,
      report.projeto?.site,
      report.projeto?.descricao,
      ...pages.flatMap((p) => [p.titulo, p.descricao, ...(p.secoes || [])]),
      ...(report.links || []).map((l) => l.texto),
      ...(report.catalogo?.itens || []).slice(0, 200).flatMap((i) => [i.nome, i.categoria]),
    ].filter(Boolean),
    corpo: [
      ...pages.flatMap((p) => (p.blocos || []).map((b) => `${b.titulo} ${b.texto}`)),
      ...(report.documentos || []).flatMap((d) => [d.titulo, ...d.secoes.map((s) => `${s.titulo} ${s.texto}`)]),
      ...(report.faq || []).map((f) => `${f.pergunta} ${f.resposta}`),
      ...(report.formularios || []).flatMap((f) => [f.botao, ...(f.campos || [])]),
      ...(report.rotas || []).map((r) => r.caminho.replace(/[/_-]+/g, " ")),
      ...(report.catalogo?.itens || []).slice(0, 200).map((i) => i.descricao || ""),
    ].filter(Boolean),
    schema: pages.flatMap((p) => p.schema || []),
  };
}
