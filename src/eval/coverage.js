// Versão 0.5: nota de cobertura. Confere se a base fala dos assuntos que visitantes mais perguntam
// e lista o que falta, para a pessoa saber exatamente o que escrever.
import { normalize } from "../agent/text.js";

export const TOPICS = [
  ["horario", "Horário de funcionamento ou atendimento", /\bhorario|abre|abrem|fecha|funcionamento|expediente|aberto\b/],
  ["contato", "Como falar com a equipe (telefone, WhatsApp, e-mail)", /contato|whatsapp|telefone|e-?mail|fale conosco|atendimento/],
  ["localizacao", "Endereço ou região atendida", /endereco|localiza|onde fica|bairro|cidade|regiao|mapa/],
  ["pagamento", "Formas de pagamento", /pagamento|pix|cartao|boleto|parcel/],
  ["entrega", "Entrega, frete ou retirada", /entrega|frete|envio|retirada|prazo/],
  ["troca", "Trocas, devoluções ou cancelamento", /troca|devolu|cancel|reembolso|arrepend/],
  ["precos", "Preços ou catálogo", /preco|valor|r\$|cardapio|catalogo|produtos|servicos|planos/],
  ["conta", "Cadastro, login ou conta", /cadastr|login|entrar|conta|senha/],
  ["privacidade", "Privacidade e uso de dados", /privacidade|dados pessoais|lgpd|cookies/],
];
// Versão 0.7: assuntos que mudam com o setor. "sem" tira assuntos que não fazem sentido (uma
// clínica não tem frete); "mais" acrescenta os típicos do setor.
const NO_SHIPPING = ["entrega", "troca"];
export const SECTOR_TOPICS = {
  saude: { sem: NO_SHIPPING, mais: [["convenios", "Convênios aceitos ou consulta particular", /convenio|plano de saude|particular/], ["agendamento", "Como agendar ou remarcar", /agend|marcar|remarcar/], ["preparo", "Preparo para exames", /preparo|jejum|exame/]] },
  educacao: { sem: NO_SHIPPING, mais: [["matricula", "Matrícula ou inscrição", /matricul|inscri/], ["certificado", "Certificado e carga horária", /certificad|carga horaria/], ["modalidade", "Modalidade (online, presencial)", /online|ead|presencial|ao vivo|gravad/]] },
  juridico: { sem: NO_SHIPPING, mais: [["areas", "Áreas de atuação", /area|atuacao|especialid|direito/], ["consulta", "Como marcar uma consulta", /consulta|agend|atendimento/]] },
  construcao: { sem: NO_SHIPPING, mais: [["orcamento", "Como pedir orçamento", /orcament|proposta/], ["portfolio", "Projetos já feitos (portfólio)", /portfolio|projetos|obras realizadas/]] },
  financas: { sem: NO_SHIPPING, mais: [["servicos", "Serviços oferecidos", /servic|abertura|imposto|folha|declarac/], ["orcamento", "Como pedir orçamento ou proposta", /orcament|proposta|honorari|mensalidade/]] },
  imobiliario: { sem: NO_SHIPPING, mais: [["visita", "Como agendar uma visita", /visita|agend/], ["garantias", "Documentos e garantias (fiador, caução)", /documento|fiador|caucao|seguro fianca|garantia/]] },
  beleza: { sem: NO_SHIPPING, mais: [["agendamento", "Como agendar", /agend|marcar|horario/], ["cancelamento", "Cancelar ou remarcar", /cancel|remarcar|desmarcar/]] },
  turismo: { sem: ["entrega"], mais: [["checkin", "Horários de check-in e check-out", /check ?in|check ?out|entrada|saida/], ["cancelamento", "Política de cancelamento", /cancel|reembolso|no show/]] },
  tecnologia: { sem: ["entrega"], mais: [["planos", "Planos e preços", /plano|pricing|assinatura|gratis|trial/], ["suporte", "Suporte técnico", /suporte|chamado|ticket|ajuda/], ["documentacao", "Documentação ou tutoriais", /documentac|docs|tutorial|guia/]] },
  logistica: { sem: ["troca"], mais: [["rastreio", "Rastreamento", /rastre|tracking|acompanh/], ["cotacao", "Cotação de frete", /cotac|orcament|simul/], ["cobertura", "Área de cobertura", /cobertura|regiao|regioes|atendemos|cidades/]] },
};
export function topicsFor(sectorId) {
  const extra = SECTOR_TOPICS[sectorId];
  if (!extra) return TOPICS;
  return [...TOPICS.filter(([id]) => !extra.sem.includes(id)), ...extra.mais];
}

export function coverage(k) {
  const text = normalize(
    [
      ...(k.faq || []).flatMap((f) => [f.pergunta, f.resposta, f.termos]),
      ...Object.values(k.intencoes || {}).flatMap((i) => [...(i.respostas || []), ...(i.exemplos || [])]),
      ...(k.paginas || []).flatMap((p) => [p.titulo, p.descricao, p.termos]),
      ...((k.catalogo?.itens || []).length || k.catalogo?.url ? ["catalogo produtos preco"] : []),
      ...(k.conteudos || []).flatMap((c) => [c.titulo, c.resumo]),
      ...(k.interacoes || []).flatMap((x) => [x.titulo, x.resumo, x.tipo]),
    ].join(" "),
  );
  const tem = [];
  const falta = [];
  const topics = topicsFor(k.setor?.id);
  for (const [id, label, re] of topics) (re.test(text) ? tem : falta).push({ id, assunto: label });
  return { tem, falta, porcentagem: Math.round((tem.length / topics.length) * 100) };
}
