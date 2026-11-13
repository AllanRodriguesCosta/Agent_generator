// Versão 0.5: relatório da avaliação em HTML (um arquivo, sem script), para abrir no navegador ou
// mostrar no portfólio: acerto por parte, frases que erraram e o que falta na base.
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LABELS = { treino: "Intenções (exemplos da base)", intencoes: "Generalização (indicativo)", faq: "Perguntas frequentes", paginas: "Páginas", frases: "Frases do projeto", variacoes: "Variações geradas (indicativo)" };
export function evaluationHtml(r, { site = "o site", data = new Date() } = {}) {
  const bars = Object.entries(r.porcentagens)
    .map(([k, v]) => `<tr><th scope="row">${esc(LABELS[k] || k)}</th><td><div class="bar" role="img" aria-label="${esc(v)}%"><span style="width:${Math.max(0, Math.min(100, Number(v) || 0))}%"></span></div></td><td>${esc(v)}% <small>(${r[k].certas}/${r[k].total})</small></td></tr>`)
    .join("");
  const errors = Object.keys(r.porcentagens)
    .flatMap((k) => (r[k].erros || []).slice(0, 15).map((e) => `<tr><td>${esc(LABELS[k] || k)}</td><td>${esc(e.frase)}</td><td>${esc(e.esperado)}</td><td>${esc(e.obtido)}</td></tr>`))
    .join("");
  const cov = r.cobertura;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Avaliação do agente — ${esc(site)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;color:#111827;background:#f8fafc}main{max-width:960px;margin:0 auto;padding:24px}h1{margin:0 0 4px}.geral{font-size:42px;font-weight:800;color:#6d28d9}table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin:12px 0 24px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #e5e7eb;vertical-align:top}.bar{height:12px;background:#ede9fe;border-radius:6px;min-width:160px}.bar span{display:block;height:100%;background:#6d28d9;border-radius:6px}small,.suave{color:#6b7280}ul{margin:6px 0 18px}</style></head>
<body><main><h1>Avaliação do agente de ${esc(site)}</h1><p class="suave">Gerada em ${esc(data.toLocaleString("pt-BR"))} pelo Agent Generator.</p>
<p>Acerto geral</p><div class="geral">${esc(r.geral ?? "-")}%</div>
<table><caption class="suave">Acerto por parte</caption><tbody>${bars}</tbody></table>
${cov ? `<h2>Cobertura: ${esc(cov.porcentagem)}%</h2><p>Assuntos que visitantes mais perguntam.</p>${cov.falta.length ? `<p><strong>Falta escrever:</strong></p><ul>${cov.falta.map((f) => `<li>${esc(f.assunto)}</li>`).join("")}</ul>` : "<p>Todos cobertos.</p>"}` : ""}
<h2>Frases que erraram</h2>${errors ? `<table><thead><tr><th>Parte</th><th>Frase</th><th>Esperado</th><th>Veio</th></tr></thead><tbody>${errors}</tbody></table>` : "<p>Nenhuma.</p>"}
</main></body></html>
`;
}
