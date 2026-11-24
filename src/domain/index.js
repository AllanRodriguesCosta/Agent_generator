// Conhecimento de domínio (versão 0.7/0.8): junta as bases novas que o gerador cria a partir do
// raio X e que a observação refina:
//   setor.json       setor detectado + glossário comum do setor (português e inglês) + sinônimos
//   conteudos.json   resumos extrativos das seções informativas, com link para o original
//   interacoes.json  o que dá para fazer no site, para que serve, o que pedir e onde fica
import { detectSector, textsFromReport } from "./detect.js";
import { SECTORS, sectorById } from "./sectors.js";
import { buildContents } from "./contents.js";
import { mapInteractions } from "./interactions.js";
import { buildMedia, buildVideos, buildFiles } from "./media.js";
import { buildProfile } from "./profile.js";
import { normalize } from "../agent/text.js";

const slug = (v) => normalize(v).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

// Versão 0.10: o que claramente NÃO é deste site ("vocês vendem carro?" numa clínica). Termos bem
// típicos dos outros setores (peso 3) e de ofertas comuns que nenhum setor cobre, tirando tudo o que
// aparece no próprio site e nos setores escolhidos. O agente usa só como último recurso, quando a
// base não tem nada sobre a frase.
export const OFERTAS_COMUNS = [
  { id: "veiculos", nome: "Veículos", termos: ["carro", "moto!", "motocicleta", "veiculo", "automovel", "pneu", "concessionaria", "seminov"] },
  { id: "moda", nome: "Moda", termos: ["roupa", "camiseta", "vestido", "calca jeans", "tenis!", "sapato"] },
  { id: "eletronicos", nome: "Eletrônicos", termos: ["celular", "smartphone", "notebook", "televis", "geladeira", "eletrodomest"] },
  { id: "pets", nome: "Animais de estimação", termos: ["racao", "petshop", "pet shop", "veterinar", "banho e tosa"] },
  { id: "seguros", nome: "Seguros", termos: ["seguro de vida", "seguro auto", "seguro residencial", "corretora de seguros"] },
  { id: "farmacia", nome: "Farmácia", termos: ["remedio", "farmacia", "medicamento"] },
];
export function outOfScope(setorIds = [], siteText = "") {
  const text = ` ${normalize(siteText)} `;
  const own = new Set(setorIds.filter(Boolean));
  const ownTerms = new Set(SECTORS.filter((s) => own.has(s.id)).flatMap((s) => s.sinais.map(([t]) => t.replace(/!$/, ""))));
  const appears = (t) => new RegExp(`(?:^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[\\s-]+")}`).test(text);
  const pack = (id, nome, termos) => {
    const list = [...new Set(termos.map((t) => t.replace(/!$/, "")).filter((t) => t.length >= 4 && !ownTerms.has(t) && !appears(t)))].slice(0, 12);
    return list.length ? { id, nome, termos: list } : null;
  };
  return [
    ...SECTORS.filter((s) => !own.has(s.id)).map((s) => pack(s.id, s.nome, s.sinais.filter(([, peso]) => peso >= 3).map(([t]) => t))),
    ...OFERTAS_COMUNS.map((o) => pack(o.id, o.nome, o.termos)),
  ].filter(Boolean);
}

// Versão 0.10: mensagens proativas (uma por sessão) nas páginas onde ajudam: galeria de fotos
// ("Quer ver as fotos mais recentes do Residencial Sol?") e páginas de orçamento/agendamento.
export function buildNudges({ midias = {}, interacoes = [] } = {}, { limite = 20 } = {}) {
  const out = [];
  const pageOf = (link) => String(link || "").split("#")[0];
  const seen = new Set();
  for (const g of midias.galerias || []) {
    const pagina = pageOf(g.link);
    if (!pagina || seen.has(pagina) || /^https?:/i.test(pagina)) continue;
    seen.add(pagina);
    out.push({ tipo: "fotos", pagina, texto: `Quer ver as fotos mais recentes de ${g.grupo}?`, sugestoes: [`Fotos de ${g.grupo}`.slice(0, 60)], aposSeg: 20 });
  }
  for (const x of interacoes) {
    const pagina = pageOf(x.link);
    if (!["orcamento", "agendamento", "reserva", "inscricao"].includes(x.tipo) || !pagina || seen.has(pagina) || /^https?:/i.test(pagina)) continue;
    seen.add(pagina);
    out.push({ tipo: "formularios", pagina, texto: `Posso te ajudar com "${x.titulo}"? Explico o que preencher.`, sugestoes: [`Como funciona ${x.titulo}?`.slice(0, 60)], aposSeg: 25 });
  }
  return out.slice(0, limite);
}

// Base setorial publicada: só o(s) setor(es) escolhido(s), sem os sinais de detecção.
export function sectorKnowledge(detection, { siteText = "" } = {}) {
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
    // Versão 0.10: só com setor definido (no "geral" tudo pode ser do site).
    fora: main && main.id !== "geral" && siteText ? outOfScope([main.id, extra?.id], siteText) : [],
  };
}

/** Gera as três bases a partir do relatório do raio X. opts.setor força um setor (ou "geral"). */
export function buildDomain(report, { setor: forcar } = {}) {
  const texts = textsFromReport(report);
  const detection = detectSector(texts, { forcar });
  const setor = sectorKnowledge(detection, { siteText: [...texts.destaque, ...texts.corpo].join(" ") });
  const pack = sectorById(setor.id);
  const conteudos = buildContents(report);
  const interacoes = mapInteractions(report, { setor: pack });
  // Versão 0.8: galerias de fotos e moldes de perfil do setor (desligados até o dono configurar).
  const midias = { galerias: buildMedia(report), videos: buildVideos(report), arquivos: buildFiles(report) };
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
    const next = sectorKnowledge(detection, { siteText: [...texts.destaque, ...texts.corpo].join(" ") });
    // Só troca com evidência: setor novo e confiante, ou nenhum setor antes.
    if (next.id !== before && (before === "geral" || next.confianca >= 0.6)) {
      k.setor = next;
      changes.setor = `${before} → ${next.id}`;
    } else if (k.setor) {
      k.setor.ranking = next.ranking;
      if (next.id === k.setor.id) k.setor.fora = next.fora;
    }
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
