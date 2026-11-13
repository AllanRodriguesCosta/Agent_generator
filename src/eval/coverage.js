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
export function coverage(k) {
  const text = normalize(
    [
      ...(k.faq || []).flatMap((f) => [f.pergunta, f.resposta, f.termos]),
      ...Object.values(k.intencoes || {}).flatMap((i) => [...(i.respostas || []), ...(i.exemplos || [])]),
      ...(k.paginas || []).flatMap((p) => [p.titulo, p.descricao, p.termos]),
      ...((k.catalogo?.itens || []).length || k.catalogo?.url ? ["catalogo produtos preco"] : []),
    ].join(" "),
  );
  const tem = [];
  const falta = [];
  for (const [id, label, re] of TOPICS) (re.test(text) ? tem : falta).push({ id, assunto: label });
  return { tem, falta, porcentagem: Math.round((tem.length / TOPICS.length) * 100) };
}
