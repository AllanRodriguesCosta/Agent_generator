// Conhecimento de domínio (versão 0.7/0.8): junta as bases novas que o gerador cria a partir do
// raio X e que a observação refina:
//   setor.json       setor detectado + glossário comum do setor (português e inglês) + sinônimos
//   conteudos.json   resumos extrativos das seções informativas, com link para o original
//   interacoes.json  o que dá para fazer no site, para que serve, o que pedir e onde fica
import { detectSector, textsFromReport } from "./detect.js";
import { SECTORS, sectorById } from "./sectors.js";
import { buildContents } from "./contents.js";
import { mapInteractions } from "./interactions.js";
import { buildMedia } from "./media.js";
import { buildProfile } from "./profile.js";
import { normalize } from "../agent/text.js";

const slug = (v) => normalize(v).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

// Base setorial publicada: só o(s) setor(es) escolhido(s), sem os sinais de detecção.
export function sectorKnowledge(detection) {
  const main = sectorById(detection.setor);
  const extra = detection.secundario ? sectorById(detection.secundario) : null;
  const packs = [main, extra].filter(Boolean);
  const seen = new Set();
  const glossario = [];
  for (const p of packs)
    for (const g of p.glossario) {
      const id = slug(g.termo);
      if (seen.has(id)) continue;
      seen.add(id);
      glossario.push({ id, termo: g.termo, sinonimos: g.sinonimos, definicao: g.definicao, setor: p.id });
    }
  return {
    id: main?.id || "geral",
    nome: main?.nome || "Geral",
    secundario: extra?.id || "",
    confianca: detection.confianca,
    forcado: Boolean(detection.forcado),
    glossario,
    sinonimos: packs.flatMap((p) => p.sinonimos),
    ranking: detection.ranking.slice(0, 4).map(({ id, nome, pontos, evidencias }) => ({ id, nome, pontos, evidencias })),
  };
}

/** Gera as três bases a partir do relatório do raio X. opts.setor força um setor (ou "geral"). */
export function buildDomain(report, { setor: forcar } = {}) {
  const detection = detectSector(textsFromReport(report), { forcar });
  const setor = sectorKnowledge(detection);
  const pack = sectorById(setor.id);
  const conteudos = buildContents(report);
  const interacoes = mapInteractions(report, { setor: pack });
  // Versão 0.8: galerias de fotos e moldes de perfil do setor (desligados até o dono configurar).
  const midias = { galerias: buildMedia(report) };
  const login = interacoes.find((x) => x.tipo === "login")?.link || "";
  const perfil = buildProfile(setor.id, { login, secundario: setor.secundario });
  return { setor, conteudos, interacoes, midias, perfil };
}

/**
 * Segunda etapa (observação): com o site rodando, a detecção usa também o texto das páginas
 * visitadas e os formulários realmente usados. Não apaga nada que já existe na base: atualiza o
 * setor (a não ser que tenha sido escolhido à mão) e acrescenta interações novas.
 */
export function enrichFromObservation(knowledge, obs = {}) {
  const k = structuredClone(knowledge);
  const changes = { setor: "", interacoes: [] };
  const pages = [...(k.paginas || []), ...(obs.paginas || [])];
  const texts = {
    destaque: [k.agente?.site, k.agente?.descricao, ...pages.flatMap((p) => [p.titulo, p.termos]), ...(k.catalogo?.itens || []).slice(0, 200).flatMap((i) => [i.nome, i.categoria])].filter(Boolean),
    corpo: [...pages.map((p) => p.descricao), ...(k.conteudos || []).map((c) => `${c.titulo} ${c.resumo}`), ...(k.faq || []).map((f) => `${f.pergunta} ${f.resposta}`), ...(obs.formularios || []).flatMap((f) => [f.titulo, f.botao])].filter(Boolean),
    schema: [],
  };
  if (!k.setor?.forcado) {
    const detection = detectSector(texts);
    const before = k.setor?.id || "geral";
    const next = sectorKnowledge(detection);
    // Só troca com evidência: setor novo e confiante, ou nenhum setor antes.
    if (next.id !== before && (before === "geral" || next.confianca >= 0.6)) {
      k.setor = next;
      changes.setor = `${before} → ${next.id}`;
    } else if (k.setor) k.setor.ranking = next.ranking;
    else k.setor = next;
  }
  const pack = sectorById(k.setor?.id) || null;
  const known = new Set((k.interacoes || []).map((i) => `${i.tipo}|${i.link}`));
  const fresh = mapInteractions({ paginas: [], formularios: [], links: [] }, { setor: pack, observacao: obs });
  k.interacoes ||= [];
  for (const i of fresh) {
    if (known.has(`${i.tipo}|${i.link}`)) continue;
    const taken = k.interacoes.filter((x) => x.tipo === i.tipo).length;
    k.interacoes.push({ ...i, id: taken ? `${i.tipo}-${taken + 1}` : i.tipo, exemplos: taken ? [] : i.exemplos });
    changes.interacoes.push(`${i.tipo} (${i.link})`);
  }
  return { knowledge: k, changes };
}

export const SECTOR_IDS = ["geral", ...SECTORS.map((s) => s.id)];
export { SECTORS };
