// Avaliação da base gerada, sem precisar de frases escritas à mão:
// - intenções: deixa cada exemplo de fora do treino e confere se ele volta para a própria intenção;
// - perguntas frequentes: a própria pergunta (e uma versão sem a primeira palavra) acha a resposta;
// - páginas: o título leva à página.
// Mostra a porcentagem de acerto e as frases que erraram, para corrigir a base.
import { train, classify } from "../agent/classifier.js";
import { createAgent } from "../agent/agent.js";
import { checkKnowledge } from "../agent/knowledge.js";

export function evaluateKnowledge(input, { extra = [] } = {}) {
  const { knowledge } = checkKnowledge(input);
  const result = { intencoes: { total: 0, certas: 0, erros: [] }, faq: { total: 0, certas: 0, erros: [] }, paginas: { total: 0, certas: 0, erros: [] }, frases: { total: 0, certas: 0, erros: [] } };
  const intents = knowledge.intencoes;
  const names = Object.keys(intents);
  // Treino: cada exemplo volta para a própria intenção (base coerente, sem exemplos em conflito).
  result.treino = { total: 0, certas: 0, erros: [] };
  if (names.length >= 2) {
    const model = train(Object.fromEntries(names.map((n) => [n, intents[n].exemplos])));
    for (const name of names)
      for (const phrase of intents[name].exemplos) {
        const top = classify(model, phrase)[0];
        result.treino.total++;
        if (top?.intent === name) result.treino.certas++;
        else result.treino.erros.push({ frase: phrase, esperado: name, obtido: top?.intent || "-" });
      }
  }
  // Generalização: deixa cada exemplo de fora (palavra que só aparece nele fica desconhecida).
  if (names.length >= 2)
    for (const name of names)
      for (const [i, phrase] of intents[name].exemplos.entries()) {
        const examples = Object.fromEntries(names.map((n) => [n, n === name ? intents[n].exemplos.filter((_, j) => j !== i) : intents[n].exemplos]));
        const top = classify(train(examples), phrase)[0];
        result.intencoes.total++;
        if (top?.intent === name) result.intencoes.certas++;
        else result.intencoes.erros.push({ frase: phrase, esperado: name, obtido: top?.intent || "-" });
      }
  const agent = createAgent(knowledge);
  for (const f of knowledge.faq) {
    for (const phrase of [f.pergunta, f.pergunta.split(" ").slice(1).join(" ")].filter((p) => p.split(" ").length >= 2)) {
      const r = agent.reply(phrase);
      result.faq.total++;
      if (r.fonte === f.id) result.faq.certas++;
      else result.faq.erros.push({ frase: phrase, esperado: f.id, obtido: r.fonte || r.intencao });
    }
  }
  for (const p of knowledge.paginas) {
    if (!p.titulo || p.href === "/") continue;
    const phrase = `onde fica ${p.titulo}`;
    const r = agent.reply(phrase);
    result.paginas.total++;
    if (r.fonte === p.id || r.acoes.some((a) => a.href === p.href)) result.paginas.certas++;
    else result.paginas.erros.push({ frase: phrase, esperado: p.id, obtido: r.fonte || r.intencao });
  }
  // Frases próprias do projeto: [{ frase, espera: "intencao" | "faq:id" | "pagina:id" | "catalogo" }]
  for (const { frase, espera } of extra) {
    const r = agent.reply(frase);
    const got = r.fonte ? `${r.intencao.replace("-provavel", "")}:${r.fonte}` : r.intencao;
    result.frases.total++;
    if (got === espera || r.intencao === espera) result.frases.certas++;
    else result.frases.erros.push({ frase, esperado: espera, obtido: got });
  }
  const pct = (x) => (x.total ? Math.round((x.certas / x.total) * 1000) / 10 : null);
  const parts = ["treino", "intencoes", "faq", "paginas", "frases"].filter((k) => result[k].total);
  // Geral: treino, perguntas, páginas e frases do projeto. A generalização é só indicativa.
  const scored = parts.filter((k) => k !== "intencoes");
  const total = scored.reduce((s, k) => s + result[k].total, 0);
  const right = scored.reduce((s, k) => s + result[k].certas, 0);
  return { ...result, porcentagens: Object.fromEntries(parts.map((k) => [k, pct(result[k])])), geral: total ? Math.round((right / total) * 1000) / 10 : null };
}

export function evaluationText(r) {
  const lines = [`Acerto geral: ${r.geral ?? "-"}%`];
  const labels = { treino: "Intenções (exemplos da base)", intencoes: "Generalização (cada exemplo fora do treino; indicativo)", faq: "Perguntas frequentes", paginas: "Páginas", frases: "Frases do projeto" };
  for (const [k, v] of Object.entries(r.porcentagens)) {
    lines.push(`- ${labels[k]}: ${v}% (${r[k].certas}/${r[k].total})`);
    for (const e of r[k].erros.slice(0, 8)) lines.push(`    errou: "${e.frase}" → esperado ${e.esperado}, veio ${e.obtido}`);
    if (r[k].erros.length > 8) lines.push(`    ... e mais ${r[k].erros.length - 8}`);
  }
  return lines.join("\n");
}
