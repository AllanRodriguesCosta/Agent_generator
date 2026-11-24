// Versão 0.8: galerias de mídia. As fotos de conteúdo de cada página (raio X ou site publicado)
// viram galerias agrupadas pela seção/etapa onde estão ("Alicerce", "Torre", "Área de lazer"...).
// O agente mostra a foto mais recente (ou a primeira, ou a de uma data) e oferece a página com
// todas as fotos daquela etapa. Nada é baixado nem copiado: só o endereço da imagem do site.
import { normalize } from "../agent/text.js";

const slug = (v) => normalize(v).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const cleanTitle = (title, site) => {
  const parts = String(title || "").split(/\s+[|–—·-]\s+/).map((p) => p.trim()).filter(Boolean);
  const rest = parts.filter((p) => normalize(p) !== normalize(site || ""));
  return (rest.length ? rest : parts).join(" - ");
};

// Endereço da foto relativo à página ("img/a.jpg" em /obras/sol/ → /obras/sol/img/a.jpg).
export function resolveSrc(src, pageHref = "/") {
  if (/^https?:\/\//i.test(src)) return src;
  try {
    const u = new URL(src, `http://site.local${pageHref.startsWith("/") ? pageHref : `/${pageHref}`}`);
    return `${u.pathname}${u.search}`;
  } catch {
    return "";
  }
}

/**
 * report.paginas[].imagens → [{ id, titulo, etapa, grupo, link, termos, itens: [{ src, legenda, data }] }]
 * Só entram páginas com 2+ fotos de conteúdo ou fotos com legenda (vitrine com 1 banner fica fora).
 */
export function buildMedia(report, { limite = 60 } = {}) {
  const site = report.projeto?.site || "";
  const out = [];
  const seen = new Set();
  for (const p of report.paginas || []) {
    const imgs = (p.imagens || []).filter((i) => i.src);
    if (!imgs.length || (imgs.length < 2 && !imgs.some((i) => i.legenda))) continue;
    const grupo = (cleanTitle(p.titulo, site) || p.href).slice(0, 80);
    const bySection = new Map();
    for (const img of imgs) {
      const key = img.etapa || "";
      if (!bySection.has(key)) bySection.set(key, []);
      bySection.get(key).push(img);
    }
    for (const [etapa, list] of bySection) {
      const titulo = etapa && normalize(etapa) !== normalize(grupo) ? `${etapa} (${grupo})` : grupo;
      let id = slug(`${grupo}-${etapa}`) || `galeria-${out.length + 1}`;
      for (let n = 2; seen.has(id); n++) id = `${slug(`${grupo}-${etapa}`)}-${n}`;
      seen.add(id);
      const ancora = list.find((i) => i.ancora)?.ancora;
      out.push({
        id,
        titulo: titulo.slice(0, 120),
        etapa: etapa.slice(0, 80),
        grupo,
        link: ancora ? `${p.href}#${ancora}` : p.href,
        termos: [...new Set(list.map((i) => i.legenda).filter(Boolean))].join(" ").slice(0, 300),
        itens: list.slice(0, 40).map((i, ordem) => ({ src: resolveSrc(i.src, p.href), legenda: i.legenda || "", data: i.data || "", ordem })).filter((i) => i.src),
      });
      if (out.length >= limite) return out;
    }
  }
  return out.filter((g) => g.itens.length);
}

export { pickPhoto } from "../agent/context.js";
