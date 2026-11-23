// Versão 0.8: perfil da pessoa logada, por setor. São moldes de pergunta e resposta que usam os
// dados que o PRÓPRIO SITE entrega ao widget (sem banco novo, sem guardar nada no servidor do
// agente). Ex.: construtora → "como está a obra do meu apartamento?" → "A unidade 1203 do
// Residencial Sol está na etapa Acabamento (78% concluída)." + a foto mais recente da etapa.
// O gerador cria os moldes do setor desativados (ativo: false): o dono liga quando o site tiver
// de onde ler os dados (agent-generator perfil <pasta> --fonte /api/minha-conta).

// Apelidos comuns: o mesmo campo com outros nomes na API do site.
export const APELIDOS = {
  nome: ["name", "firstName", "primeiroNome", "given_name", "cliente"],
  empreendimento: ["condominio", "obra", "projeto", "residencial", "building", "project"],
  unidade: ["apartamento", "apto", "unit", "lote", "casa"],
  etapa: ["fase", "stage", "status", "etapaAtual"],
  percentual: ["percentualConcluido", "progresso", "progress", "andamento", "percent"],
  previsao: ["previsaoEntrega", "entrega", "dataEntrega", "deliveryDate", "prazo"],
  pedido: ["numeroPedido", "orderNumber", "codigo", "order"],
  status: ["situacao", "estado", "state"],
  rastreio: ["codigoRastreio", "tracking", "trackingCode"],
  plano: ["plan", "assinatura", "subscription"],
  vencimento: ["dueDate", "dataVencimento", "proximoVencimento"],
  valor: ["amount", "total", "valorFatura"],
  data: ["date", "quando", "dataHora", "horario"],
  profissional: ["medico", "doutor", "professional", "atendente"],
  curso: ["course", "turma", "disciplina"],
  processo: ["numeroProcesso", "caso", "case"],
};

const P = (id, rotulo, exemplos, resposta, extra = {}) => ({ id, rotulo, exemplos, resposta, ...extra });

// Moldes por setor. "midia": busca de galeria montada com os dados ("{etapa}") e "grupo": campo
// que escolhe a galeria certa quando há várias (o empreendimento da pessoa, por exemplo).
export const PERFIL_SETOR = {
  construcao: [
    P("andamento_obra", "o andamento da sua obra", ["como está a obra do meu apartamento", "andamento da minha obra", "em que etapa está meu apartamento", "minha obra está atrasada?", "quanto falta para terminar meu apartamento", "progresso da obra da minha unidade"], "A unidade {unidade} do {empreendimento} está na etapa {etapa}[, com {percentual}% concluído].", { midia: "{etapa}", grupo: "empreendimento" }),
    P("previsao_entrega", "a previsão de entrega", ["quando vou receber as chaves", "previsão de entrega do meu apartamento", "quando entregam minha unidade", "data de entrega da minha obra"], "A previsão de entrega da unidade {unidade} ({empreendimento}) é {previsao}."),
    P("fotos_minha_obra", "as fotos da sua obra", ["fotos da minha obra", "quero ver fotos do meu prédio", "última foto da minha obra", "mostra como está meu condomínio"], "Veja como está o {empreendimento}[ (etapa {etapa})].", { midia: "{etapa}", grupo: "empreendimento" }),
  ],
  imobiliario: [
    P("visita_agendada", "sua visita agendada", ["quando é minha visita", "minha visita ao imóvel", "horário da visita que marquei", "tenho visita agendada?"], "Sua visita ao imóvel {imovel} está marcada para {data}."),
    P("contrato", "a situação do seu contrato", ["como está meu contrato", "situação da minha proposta", "minha proposta foi aceita?", "status do meu aluguel"], "Seu contrato/proposta do imóvel {imovel} está: {status}."),
  ],
  varejo: [
    P("ultimo_pedido", "seu último pedido", ["onde está meu pedido", "status do meu pedido", "meu pedido já saiu?", "quando chega minha compra", "rastrear meu pedido"], "Seu pedido {pedido} está: {status}.[ Código de rastreio: {rastreio}.]"),
    P("pontos", "seus pontos/cashback", ["quantos pontos eu tenho", "meu cashback", "saldo de pontos", "tenho cupom?"], "Você tem {pontos} pontos."),
  ],
  alimentacao: [
    P("pedido_andamento", "seu pedido", ["meu pedido está saindo?", "status do meu pedido", "quanto tempo falta para meu pedido", "cadê meu lanche"], "Seu pedido {pedido} está: {status}.[ Previsão: {previsao}.]"),
    P("fidelidade", "seu cartão fidelidade", ["quantos selos eu tenho", "meus pontos fidelidade", "falta quanto para o brinde"], "Você tem {pontos} pontos no programa de fidelidade."),
  ],
  logistica: [
    P("rastreio_envio", "seu envio", ["onde está minha encomenda", "rastrear meu envio", "status da minha entrega", "minha carga já saiu?"], "Seu envio {rastreio} está: {status}.[ Previsão: {previsao}.]"),
  ],
  financas: [
    P("fatura", "sua fatura", ["quando vence minha fatura", "valor da minha fatura", "minha próxima parcela", "quanto devo pagar este mês"], "Sua próxima fatura é de {valor}, com vencimento em {vencimento}."),
    P("plano_conta", "seu plano", ["qual é o meu plano", "minha conta é de qual tipo", "meu limite"], "Seu plano atual é {plano}."),
  ],
  tecnologia: [
    P("meu_plano", "seu plano", ["qual é o meu plano", "minha assinatura", "quando renova meu plano", "meu plano vence quando"], "Você está no plano {plano}[, com renovação em {vencimento}]."),
    P("chamados", "seus chamados", ["meus chamados abertos", "status do meu ticket", "minha solicitação de suporte"], "Seu chamado {chamado} está: {status}."),
  ],
  saude: [
    P("proxima_consulta", "sua próxima consulta", ["quando é minha consulta", "minha próxima consulta", "horário da minha consulta", "com quem é minha consulta"], "Sua próxima consulta é em {data}[, com {profissional}]."),
    P("exames", "seus exames", ["meus exames ficaram prontos?", "resultado do meu exame", "status dos meus exames"], "Seu exame {exame} está: {status}."),
  ],
  educacao: [
    P("minhas_aulas", "suas aulas", ["qual minha próxima aula", "horário da minha aula", "meu curso começa quando"], "Sua próxima aula de {curso} é em {data}."),
    P("notas", "suas notas", ["qual minha nota", "minhas notas", "fui aprovado?", "minha frequência"], "Em {curso}, sua nota é {nota}[ e a frequência {frequencia}]."),
  ],
  juridico: [
    P("andamento_processo", "o andamento do seu processo", ["como está meu processo", "andamento do meu caso", "teve novidade no meu processo", "última movimentação do processo"], "Seu processo {processo} teve a última movimentação em {data}: {status}."),
  ],
  beleza: [
    P("proximo_horario", "seu próximo horário", ["quando é meu horário", "meu agendamento", "que horas é meu corte", "com quem marquei"], "Seu próximo horário é {data}[, com {profissional}][ ({servico})]."),
    P("pacote", "seu pacote", ["quantas sessões faltam", "meu pacote", "saldo do meu pacote"], "Restam {sessoes} sessões no seu pacote {pacote}."),
  ],
  turismo: [
    P("minha_reserva", "sua reserva", ["minha reserva", "quando é minha viagem", "status da minha reserva", "detalhes do meu pacote"], "Sua reserva para {destino} é em {data}.[ Situação: {status}.]"),
  ],
  geral: [P("minha_conta", "os dados da sua conta", ["meus dados", "minha conta", "o que tem na minha conta"], "Sua conta está em nome de {nome}.")],
};

/** perfil.json gerado: moldes do setor (e do secundário), desligado até o dono configurar. */
export function buildProfile(setorId, { login = "", secundario = "" } = {}) {
  const list = [...(PERFIL_SETOR[setorId] || []), ...(secundario ? PERFIL_SETOR[secundario] || [] : [])];
  const perguntas = (list.length ? list : PERFIL_SETOR.geral).map((p) => ({ ...p, exemplos: [...p.exemplos] }));
  return {
    ativo: false,
    fonte: "",
    validadeMin: 15,
    pagina: login,
    apelidos: APELIDOS,
    perguntas,
  };
}
