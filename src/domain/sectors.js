// Bases comuns por setor (versão 0.7). Cada setor traz:
// - sinais: começos de palavra (sem acento, minúsculas; com "!" no fim = palavra exata, com ou
//   sem "s": "cart!" não conta "cartão") que denunciam o setor, em português e em
//   inglês, com peso (3 = muito típico, 1 = aparece em outros setores também);
// - schema: tipos do schema.org (JSON-LD) típicos do setor;
// - glossario: termos comuns do setor com sinônimos (inclusive em inglês) e uma definição GERAL.
//   A definição explica o conceito, nunca uma regra do site (prazo, preço, política): essas só vêm
//   do próprio site;
// - sinonimos: grupos de palavras equivalentes, usados para ampliar a busca;
// - frases: jeitos típicos de pedir cada interação no setor (entram nos exemplos da interação).
// Só o setor escolhido vai para a base publicada (setor.json); o resto fica no gerador.

export const SECTORS = [
  {
    id: "varejo",
    nome: "Varejo e e-commerce",
    sinais: [["carrinho", 3], ["cart!", 3], ["checkout", 3], ["frete", 2], ["shipping", 2], ["produt", 2], ["product", 2], ["compr", 2], ["loja", 2], ["store!", 2], ["shop!", 2], ["estoque", 2], ["cupom", 2], ["coupon", 2], ["desconto", 1], ["parcel", 2], ["pix!", 2], ["troca", 1], ["devoluc", 2], ["preco", 1], ["price", 1]],
    schema: ["Product", "Offer", "Store", "OnlineStore", "ShoppingCenter"],
    glossario: [
      { termo: "Frete", sinonimos: ["shipping", "envio", "entrega"], definicao: "Valor cobrado para transportar a compra até o endereço de entrega. Costuma variar com o CEP, o peso e a modalidade escolhida." },
      { termo: "Prazo de entrega", sinonimos: ["delivery time", "lead time"], definicao: "Tempo entre a confirmação do pagamento e a chegada do pedido. Normalmente é contado em dias úteis." },
      { termo: "Direito de arrependimento", sinonimos: ["desistencia", "arrependimento", "7 dias"], definicao: "Pelo Código de Defesa do Consumidor (art. 49), compras feitas fora da loja física podem ser canceladas em até 7 dias após o recebimento." },
      { termo: "Troca", sinonimos: ["exchange", "trocar"], definicao: "Substituição de um produto por outro (tamanho, cor ou modelo). As condições de troca são definidas pela política da loja." },
      { termo: "Devolução", sinonimos: ["return", "refund", "reembolso", "estorno"], definicao: "Envio do produto de volta à loja com restituição do valor pago, de acordo com a política da loja e o CDC." },
      { termo: "Cupom de desconto", sinonimos: ["cupom", "coupon", "voucher", "promo code"], definicao: "Código que reduz o valor da compra quando aplicado no carrinho ou no pagamento, dentro das regras da promoção." },
      { termo: "Pix", sinonimos: ["pagamento instantaneo"], definicao: "Meio de pagamento instantâneo do Banco Central: o valor cai na hora, a qualquer dia e horário." },
      { termo: "Parcelamento", sinonimos: ["parcelas", "installments", "sem juros"], definicao: "Divisão do valor da compra em pagamentos mensais no cartão de crédito, com ou sem juros." },
      { termo: "Código de rastreio", sinonimos: ["rastreio", "tracking", "tracking code"], definicao: "Código fornecido pela transportadora para acompanhar o caminho do pedido até a entrega." },
      { termo: "SKU", sinonimos: ["codigo do produto", "stock keeping unit"], definicao: "Código interno que identifica cada variação de um produto (cor, tamanho) no estoque." },
    ],
    sinonimos: [["frete", "entrega", "envio", "shipping", "delivery"], ["devolucao", "reembolso", "estorno", "refund", "return"], ["cupom", "voucher", "coupon", "desconto"], ["carrinho", "sacola", "cart", "bag"], ["parcelar", "parcelas", "installments"]],
    frases: {
      compra: ["quero comprar", "como faço para comprar", "como finalizo a compra", "add to cart", "checkout"],
      rastreio: ["onde está meu pedido", "rastrear minha encomenda", "track my order"],
      suporte: ["quero trocar um produto", "quero devolver", "produto veio com defeito"],
    },
  },
  {
    id: "alimentacao",
    nome: "Alimentação (restaurante, café, delivery)",
    sinais: [["cardapio", 3], ["menu!", 2], ["prato", 3], ["restaurante", 3], ["delivery", 2], ["lanche", 3], ["pizza", 3], ["cafe", 2], ["bebida", 2], ["sobremesa", 3], ["reserva", 1], ["mesa!", 1], ["ifood", 3], ["refeic", 3], ["chef!", 2], ["gastronom", 3], ["vegan", 2], ["gluten", 2], ["torra", 3], ["grao", 2]],
    schema: ["Restaurant", "CafeOrCoffeeShop", "FoodEstablishment", "Menu", "MenuItem", "Bakery"],
    glossario: [
      { termo: "Cardápio", sinonimos: ["menu", "carta"], definicao: "Lista de pratos e bebidas oferecidos, normalmente com preço e descrição." },
      { termo: "Delivery", sinonimos: ["entrega", "tele-entrega", "shipping", "frete"], definicao: "Entrega do pedido no endereço do cliente, geralmente com taxa e área de atendimento definidas pelo estabelecimento." },
      { termo: "Retirada no balcão", sinonimos: ["take away", "pickup", "para viagem", "retirada"], definicao: "O cliente faz o pedido e busca no estabelecimento, sem taxa de entrega." },
      { termo: "Couvert", sinonimos: ["cover"], definicao: "Valor cobrado por entradas servidas antes do pedido ou por música ao vivo. É opcional quando não for informado antes." },
      { termo: "Taxa de serviço", sinonimos: ["10%", "gorjeta", "service charge"], definicao: "Percentual sugerido sobre a conta, em geral 10%, para a equipe. Não é obrigatório pagar." },
      { termo: "Vegano", sinonimos: ["vegan", "plant based"], definicao: "Sem nenhum ingrediente de origem animal (carne, leite, ovos, mel)." },
      { termo: "Sem glúten", sinonimos: ["gluten free", "celiaco"], definicao: "Preparado sem trigo, centeio, cevada e derivados; importante para pessoas com doença celíaca." },
      { termo: "Torra", sinonimos: ["roast"], definicao: "Etapa que transforma o grão verde de café; torras claras são mais ácidas e as escuras, mais amargas e encorpadas." },
    ],
    sinonimos: [["cardapio", "menu", "carta"], ["delivery", "entrega", "tele", "shipping", "frete"], ["retirada", "pickup", "balcao", "viagem"], ["reserva", "reservation", "booking"]],
    frases: {
      compra: ["quero fazer um pedido", "quero pedir", "fazer pedido pelo site", "order food"],
      reserva: ["reservar uma mesa", "quero fazer uma reserva", "book a table"],
    },
  },
  {
    id: "logistica",
    nome: "Logística e transporte",
    sinais: [["rastre", 3], ["tracking", 3], ["frete", 2], ["cotac", 2], ["carga", 3], ["transport", 3], ["armazen", 3], ["warehouse", 3], ["frota", 3], ["coleta", 3], ["remet", 3], ["destinat", 3], ["cte!", 3], ["mdfe", 3], ["fulfillment", 3], ["last mile", 3], ["ultima milha", 3], ["despach", 2], ["encomenda", 1], ["logist", 3]],
    schema: ["MovingCompany", "ParcelDelivery", "DeliveryEvent", "ShippingDeliveryTime"],
    glossario: [
      { termo: "CT-e", sinonimos: ["conhecimento de transporte eletronico", "cte"], definicao: "Documento fiscal eletrônico que registra a prestação do serviço de transporte de cargas." },
      { termo: "MDF-e", sinonimos: ["manifesto eletronico", "mdfe"], definicao: "Manifesto eletrônico que reúne os documentos fiscais de uma viagem (cargas transportadas num mesmo veículo)." },
      { termo: "Cotação de frete", sinonimos: ["freight quote", "orcamento de frete", "cotacao"], definicao: "Estimativa de preço e prazo do transporte, calculada com origem, destino, peso, medidas e valor da carga." },
      { termo: "Cubagem", sinonimos: ["peso cubado", "dimensional weight"], definicao: "Peso calculado pelo volume da embalagem. Quando é maior que o peso real, é ele que define o valor do frete." },
      { termo: "Coleta", sinonimos: ["pickup", "retirada"], definicao: "Busca da mercadoria no endereço do remetente pela transportadora." },
      { termo: "Última milha", sinonimos: ["last mile"], definicao: "Etapa final da entrega, do centro de distribuição até o endereço do destinatário." },
      { termo: "Fulfillment", sinonimos: ["armazenagem e expedicao"], definicao: "Serviço terceirizado que armazena, separa, embala e envia os pedidos de uma loja." },
      { termo: "Logística reversa", sinonimos: ["reverse logistics", "devolucao"], definicao: "Caminho inverso do produto: do cliente de volta à empresa (devolução, troca, reciclagem)." },
      { termo: "SLA", sinonimos: ["service level agreement", "acordo de nivel de servico"], definicao: "Compromisso de prazo e qualidade combinado entre a empresa e o cliente." },
    ],
    sinonimos: [["rastrear", "rastreio", "tracking", "acompanhar", "localizar"], ["cotacao", "orcamento", "quote", "simular"], ["coleta", "pickup", "retirada"], ["carga", "mercadoria", "encomenda", "volume"]],
    frases: {
      rastreio: ["rastrear carga", "onde está minha encomenda", "track shipment", "consultar objeto"],
      orcamento: ["cotar frete", "quero uma cotação", "simular frete", "freight quote"],
    },
  },
  {
    id: "financas",
    nome: "Contabilidade e finanças",
    sinais: [["contab", 3], ["contador", 3], ["imposto", 3], ["tribut", 3], ["fiscal", 2], ["simples nacional", 3], ["mei!", 2], ["cnpj", 2], ["nota fiscal", 2], ["folha de pagamento", 3], ["payroll", 3], ["balanc", 2], ["dre!", 3], ["irpf", 3], ["declarac", 2], ["invest", 2], ["credito", 2], ["financ", 2], ["fluxo de caixa", 3], ["cash flow", 3], ["accounting", 3], ["tax!", 2]],
    schema: ["AccountingService", "FinancialService", "BankOrCreditUnion", "InvestmentOrDeposit", "LoanOrCredit"],
    glossario: [
      { termo: "MEI", sinonimos: ["microempreendedor individual"], definicao: "Categoria de empresa para quem fatura até o limite anual definido em lei, com impostos fixos mensais pagos no DAS." },
      { termo: "Simples Nacional", sinonimos: ["simples"], definicao: "Regime tributário simplificado para micro e pequenas empresas, que reúne vários impostos numa guia única." },
      { termo: "DAS", sinonimos: ["documento de arrecadacao do simples"], definicao: "Guia mensal de pagamento dos tributos do MEI e do Simples Nacional." },
      { termo: "Pró-labore", sinonimos: ["pro labore"], definicao: "Remuneração dos sócios pelo trabalho na empresa, diferente da distribuição de lucros." },
      { termo: "DRE", sinonimos: ["demonstracao do resultado", "income statement"], definicao: "Relatório que mostra receitas, custos e despesas de um período e se houve lucro ou prejuízo." },
      { termo: "Balanço patrimonial", sinonimos: ["balance sheet", "balanco"], definicao: "Retrato da empresa numa data: bens e direitos (ativo), obrigações (passivo) e patrimônio líquido." },
      { termo: "Fluxo de caixa", sinonimos: ["cash flow"], definicao: "Controle das entradas e saídas de dinheiro, para prever se haverá saldo para as contas." },
      { termo: "Nota fiscal", sinonimos: ["nf-e", "nfs-e", "invoice"], definicao: "Documento que registra uma venda ou prestação de serviço para fins fiscais." },
      { termo: "Declaração de Imposto de Renda", sinonimos: ["irpf", "imposto de renda", "income tax return"], definicao: "Informação anual de rendimentos, bens e despesas à Receita Federal, que calcula imposto a pagar ou a restituir." },
      { termo: "CDI", sinonimos: ["certificado de deposito interbancario"], definicao: "Taxa de referência de muitos investimentos de renda fixa no Brasil; acompanha de perto a Selic." },
    ],
    sinonimos: [["contador", "contabilidade", "accountant", "accounting"], ["imposto", "tributo", "tax", "taxa"], ["nota fiscal", "nf", "nfe", "invoice"], ["abrir empresa", "abertura", "cnpj"]],
    frases: {
      orcamento: ["quanto custa a contabilidade", "quero um orçamento", "pedir proposta", "request a quote"],
      contato: ["falar com um contador", "talk to an accountant"],
    },
  },
  {
    id: "construcao",
    nome: "Arquitetura, engenharia e construção",
    sinais: [["arquitet", 3], ["projeto arquitet", 3], ["interiores", 3], ["interior design", 3], ["reforma", 3], ["obra", 3], ["construc", 3], ["engenhar", 2], ["planta", 2], ["paisagis", 3], ["render!", 1], ["3d!", 1], ["memorial descritivo", 3], ["art!", 1], ["rrt!", 3], ["alvara", 3], ["bim!", 3], ["revit", 3], ["autocad", 3], ["marcenar", 3]],
    schema: ["HomeAndConstructionBusiness", "GeneralContractor", "Architect"],
    glossario: [
      { termo: "Projeto arquitetônico", sinonimos: ["architectural design", "projeto"], definicao: "Conjunto de desenhos e documentos que definem como a construção vai ser: plantas, cortes, fachadas e especificações." },
      { termo: "Anteprojeto", sinonimos: ["estudo preliminar", "schematic design"], definicao: "Primeira versão do projeto, para aprovar a ideia geral antes do detalhamento." },
      { termo: "Projeto executivo", sinonimos: ["construction documents"], definicao: "Versão detalhada do projeto, com tudo o que a obra precisa para ser executada." },
      { termo: "RRT", sinonimos: ["registro de responsabilidade tecnica"], definicao: "Registro no CAU que identifica o arquiteto responsável por um serviço." },
      { termo: "ART", sinonimos: ["anotacao de responsabilidade tecnica"], definicao: "Registro no CREA que identifica o engenheiro responsável por um serviço ou obra." },
      { termo: "Alvará de construção", sinonimos: ["alvara", "building permit"], definicao: "Autorização da prefeitura para construir ou reformar, emitida após a aprovação do projeto." },
      { termo: "BIM", sinonimos: ["building information modeling"], definicao: "Metodologia em que o projeto é um modelo 3D com informações de materiais, custos e prazos." },
      { termo: "Render", sinonimos: ["renderizacao", "imagem 3d", "perspectiva"], definicao: "Imagem realista gerada a partir do modelo 3D, para visualizar o resultado antes da obra." },
      { termo: "Memorial descritivo", sinonimos: ["especificacao"], definicao: "Documento que descreve materiais, acabamentos e técnicas que serão usados na obra." },
    ],
    sinonimos: [["reforma", "renovacao", "remodelacao", "renovation"], ["projeto", "design", "planta"], ["orcamento", "proposta", "quote", "estimativa"], ["obra", "construcao", "construction"]],
    frases: {
      orcamento: ["quanto custa um projeto", "quero orçar uma reforma", "pedir orçamento de obra", "request a quote"],
      agendamento: ["marcar uma visita técnica", "agendar reunião com o arquiteto"],
    },
  },
  {
    id: "tecnologia",
    nome: "Tecnologia e software",
    sinais: [["software", 3], ["saas!", 3], ["api!", 2], ["deploy", 3], ["cloud!", 2], ["nuvem", 2], ["dashboard", 2], ["integrac", 2], ["plano!", 1], ["pricing", 2], ["trial!", 3], ["teste gratis", 3], ["free tier", 3], ["documentac", 2], ["docs!", 2], ["sdk!", 3], ["webhook", 3], ["login!", 1], ["onboarding", 2], ["app!", 1], ["github", 2], ["open source", 3], ["devops", 3], ["frontend", 3], ["backend", 3]],
    schema: ["SoftwareApplication", "WebApplication", "MobileApplication", "SoftwareSourceCode", "TechArticle"],
    glossario: [
      { termo: "API", sinonimos: ["application programming interface", "interface de programacao"], definicao: "Conjunto de endereços e regras que permite que outro sistema converse com o software de forma automática." },
      { termo: "SaaS", sinonimos: ["software as a service", "software como servico"], definicao: "Software usado pelo navegador e pago por assinatura, sem instalar nada no computador." },
      { termo: "Deploy", sinonimos: ["publicacao", "implantacao", "release"], definicao: "Colocar uma nova versão do sistema no ar para os usuários." },
      { termo: "Webhook", sinonimos: ["callback"], definicao: "Aviso automático que um sistema manda para outro quando algo acontece (por exemplo, um pagamento aprovado)." },
      { termo: "SDK", sinonimos: ["software development kit", "kit de desenvolvimento"], definicao: "Pacote de bibliotecas e exemplos que facilita usar uma API numa linguagem de programação." },
      { termo: "Autenticação em dois fatores", sinonimos: ["2fa", "mfa", "two factor", "dois fatores"], definicao: "Login que pede uma segunda prova além da senha, como um código no celular." },
      { termo: "Período de teste", sinonimos: ["trial", "free trial", "teste gratis"], definicao: "Tempo em que o produto pode ser usado sem pagar, para conhecer antes de assinar." },
      { termo: "Uptime", sinonimos: ["disponibilidade", "sla"], definicao: "Porcentagem do tempo em que o serviço ficou no ar. 99,9% equivale a cerca de 43 minutos fora do ar por mês." },
      { termo: "Bug", sinonimos: ["erro", "falha", "defeito"], definicao: "Erro no software que faz ele se comportar de um jeito diferente do esperado." },
      { termo: "Open source", sinonimos: ["codigo aberto"], definicao: "Software com código público, que qualquer pessoa pode ler e, conforme a licença, usar e modificar." },
    ],
    sinonimos: [["plano", "assinatura", "pricing", "plan", "subscription"], ["documentacao", "docs", "manual", "guia"], ["erro", "bug", "falha", "issue"], ["integracao", "integration", "conectar"], ["teste", "trial", "demo", "demonstracao"]],
    frases: {
      cadastro: ["criar conta grátis", "começar o teste", "sign up", "start free trial"],
      suporte: ["abrir um chamado", "reportar um bug", "open a ticket", "falar com o suporte técnico"],
      agendamento: ["agendar uma demonstração", "book a demo", "quero uma demo"],
    },
  },
  {
    id: "saude",
    nome: "Saúde",
    sinais: [["consult", 2], ["paciente", 3], ["medic", 3], ["clinic", 3], ["exame", 3], ["convenio", 3], ["plano de saude", 3], ["especialid", 2], ["odonto", 3], ["dentist", 3], ["psicolog", 3], ["fisioterap", 3], ["nutricion", 3], ["telemedic", 3], ["hospital", 3], ["sintoma", 3], ["tratament", 2], ["health", 2], ["doctor", 3]],
    schema: ["MedicalClinic", "Physician", "Hospital", "Dentist", "MedicalBusiness", "MedicalSpecialty"],
    glossario: [
      { termo: "Convênio", sinonimos: ["plano de saude", "health insurance", "operadora"], definicao: "Plano de saúde aceito pelo consultório ou clínica. A cobertura de cada procedimento depende do plano contratado." },
      { termo: "Consulta particular", sinonimos: ["particular", "private"], definicao: "Atendimento pago diretamente pelo paciente, sem usar o plano de saúde." },
      { termo: "Retorno", sinonimos: ["consulta de retorno", "follow up"], definicao: "Nova consulta para mostrar exames ou acompanhar o tratamento. Prazo e cobrança variam conforme o profissional e o plano." },
      { termo: "Teleconsulta", sinonimos: ["telemedicina", "consulta online", "telehealth"], definicao: "Consulta feita por vídeo, regulamentada no Brasil pela Lei 14.510/2022." },
      { termo: "Pedido médico", sinonimos: ["guia", "requisicao", "solicitacao de exame"], definicao: "Documento do profissional que solicita exames ou procedimentos; muitos planos exigem para autorizar." },
      { termo: "Jejum", sinonimos: ["fasting"], definicao: "Período sem comer antes de alguns exames de sangue. O tempo certo é informado pelo laboratório para cada exame." },
      { termo: "Carência", sinonimos: ["waiting period"], definicao: "Tempo após a contratação do plano de saúde em que alguns procedimentos ainda não têm cobertura." },
      { termo: "Prontuário", sinonimos: ["historico medico", "medical record"], definicao: "Registro das consultas, exames e tratamentos do paciente; é sigiloso e o paciente tem direito a uma cópia." },
    ],
    sinonimos: [["consulta", "atendimento", "appointment", "visita"], ["convenio", "plano", "insurance"], ["exame", "teste", "lab"], ["medico", "doutor", "doctor", "especialista"]],
    frases: {
      agendamento: ["marcar consulta", "agendar consulta", "tem horário disponível", "book an appointment", "marcar exame"],
      contato: ["falar com a recepção", "telefone da clínica"],
    },
  },
  {
    id: "educacao",
    nome: "Educação e cursos",
    sinais: [["curso", 3], ["aula", 3], ["aluno", 3], ["student", 3], ["matricul", 3], ["inscric", 2], ["certificad", 3], ["professor", 2], ["ead!", 3], ["ensino", 3], ["escola", 3], ["faculdade", 3], ["vestibular", 3], ["mensalidade", 2], ["grade curricular", 3], ["modulo!", 2], ["course", 3], ["lesson!", 3], ["bootcamp", 3], ["mentoria", 2]],
    schema: ["Course", "EducationalOrganization", "CollegeOrUniversity", "School", "CourseInstance"],
    glossario: [
      { termo: "EAD", sinonimos: ["ensino a distancia", "online", "e-learning"], definicao: "Curso feito pela internet, com aulas gravadas ou ao vivo, sem precisar ir até a escola." },
      { termo: "Matrícula", sinonimos: ["enrollment", "inscricao"], definicao: "Registro do aluno no curso, que garante a vaga e o acesso às aulas." },
      { termo: "Certificado", sinonimos: ["certificate", "diploma"], definicao: "Documento que comprova a conclusão do curso e a carga horária cumprida." },
      { termo: "Carga horária", sinonimos: ["workload", "horas"], definicao: "Total de horas previsto para concluir o curso." },
      { termo: "Grade curricular", sinonimos: ["ementa", "syllabus", "conteudo programatico"], definicao: "Lista de disciplinas ou módulos do curso, com os assuntos de cada um." },
      { termo: "Aula síncrona", sinonimos: ["ao vivo", "live"], definicao: "Aula em tempo real, com professor e alunos conectados ao mesmo tempo." },
      { termo: "Aula assíncrona", sinonimos: ["gravada", "on demand"], definicao: "Aula gravada, que o aluno assiste quando quiser." },
      { termo: "Bolsa de estudo", sinonimos: ["scholarship", "bolsa"], definicao: "Desconto parcial ou total na mensalidade, conforme critérios da instituição." },
    ],
    sinonimos: [["curso", "course", "treinamento", "formacao"], ["matricula", "inscricao", "enrollment"], ["aula", "lesson", "class"], ["mensalidade", "preco", "valor", "fee"]],
    frases: {
      inscricao: ["quero me matricular", "como faço a inscrição", "enroll", "quero fazer o curso"],
      download: ["baixar material", "download da apostila"],
    },
  },
  {
    id: "imobiliario",
    nome: "Imobiliário",
    sinais: [["imovel", 3], ["imoveis", 3], ["aluguel", 3], ["alugar", 3], ["venda!", 1], ["apartamento", 3], ["casa!", 1], ["condominio", 3], ["iptu", 3], ["corretor", 3], ["creci", 3], ["financiamento", 2], ["vistoria", 3], ["fiador", 3], ["quarto", 2], ["dormitorio", 3], ["real estate", 3], ["property", 2], ["rent!", 2]],
    schema: ["RealEstateAgent", "Accommodation", "Apartment", "House", "Residence"],
    glossario: [
      { termo: "IPTU", sinonimos: ["imposto predial"], definicao: "Imposto municipal anual sobre o imóvel. No aluguel, quem paga é definido no contrato." },
      { termo: "Condomínio", sinonimos: ["taxa de condominio", "hoa"], definicao: "Valor mensal dividido entre os moradores para manter as áreas comuns do prédio ou loteamento." },
      { termo: "Fiador", sinonimos: ["guarantor"], definicao: "Pessoa que garante o pagamento do aluguel caso o inquilino não pague." },
      { termo: "Seguro-fiança", sinonimos: ["seguro fianca"], definicao: "Seguro contratado pelo inquilino que substitui o fiador como garantia do aluguel." },
      { termo: "Caução", sinonimos: ["deposito", "security deposit"], definicao: "Garantia paga adiantado no aluguel, em geral até 3 meses, devolvida no fim do contrato." },
      { termo: "Vistoria", sinonimos: ["inspecao", "laudo de vistoria"], definicao: "Registro do estado do imóvel na entrada e na saída do inquilino, para comparar danos." },
      { termo: "Financiamento imobiliário", sinonimos: ["mortgage", "financiamento"], definicao: "Empréstimo de longo prazo para comprar o imóvel, com o próprio imóvel como garantia." },
      { termo: "ITBI", sinonimos: ["imposto de transmissao"], definicao: "Imposto municipal pago na compra de um imóvel, para registrar a transferência." },
    ],
    sinonimos: [["aluguel", "locacao", "alugar", "rent"], ["comprar", "venda", "compra", "buy"], ["apartamento", "ap", "apto", "flat"], ["quarto", "dormitorio", "bedroom"]],
    frases: {
      agendamento: ["agendar uma visita", "quero visitar o imóvel", "schedule a visit"],
      busca: ["procuro apartamento para alugar", "imóveis à venda"],
    },
  },
  {
    id: "juridico",
    nome: "Jurídico",
    sinais: [["advog", 3], ["advocacia", 3], ["juridic", 3], ["processo", 2], ["direito", 2], ["oab!", 3], ["trabalhist", 3], ["previdenc", 3], ["inss!", 3], ["aposentador", 3], ["contrato", 2], ["indeniz", 3], ["divorcio", 3], ["inventario", 3], ["law!", 2], ["lawyer", 3], ["attorney", 3]],
    schema: ["LegalService", "Attorney", "Notary"],
    glossario: [
      { termo: "Honorários", sinonimos: ["fees", "honorario"], definicao: "Remuneração do advogado, combinada em contrato; a OAB publica tabelas de referência por estado." },
      { termo: "Procuração", sinonimos: ["power of attorney"], definicao: "Documento em que a pessoa autoriza o advogado a representá-la." },
      { termo: "Petição inicial", sinonimos: ["peticao", "acao"], definicao: "Documento que abre um processo na Justiça, com os fatos e os pedidos." },
      { termo: "Audiência", sinonimos: ["hearing"], definicao: "Sessão com o juiz para tentar acordo, ouvir as partes ou testemunhas." },
      { termo: "Recurso", sinonimos: ["appeal", "apelacao"], definicao: "Pedido para um tribunal rever uma decisão." },
      { termo: "Juizado Especial", sinonimos: ["pequenas causas"], definicao: "Justiça mais rápida para causas de menor valor; em alguns casos dispensa advogado." },
      { termo: "Prazo prescricional", sinonimos: ["prescricao", "statute of limitations"], definicao: "Tempo máximo para entrar com uma ação; depois dele o direito de cobrar na Justiça se perde." },
    ],
    sinonimos: [["advogado", "advogada", "lawyer", "attorney", "doutor"], ["processo", "acao", "case", "lawsuit"], ["consulta", "atendimento", "reuniao"]],
    frases: {
      agendamento: ["marcar uma consulta jurídica", "agendar atendimento com advogado"],
      contato: ["falar com um advogado", "talk to a lawyer"],
    },
  },
  {
    id: "beleza",
    nome: "Beleza e bem-estar",
    sinais: [["salao", 3], ["cabel", 3], ["manicure", 3], ["estetic", 3], ["barbear", 3], ["barber", 3], ["spa!", 3], ["massag", 3], ["unha", 3], ["depilac", 3], ["maquiag", 3], ["sobrancelha", 3], ["skincare", 3], ["academia", 2], ["pilates", 3], ["yoga", 3], ["personal", 2], ["fitness", 3], ["gym!", 3]],
    schema: ["BeautySalon", "HairSalon", "DaySpa", "HealthAndBeautyBusiness", "NailSalon", "ExerciseGym"],
    glossario: [
      { termo: "Progressiva", sinonimos: ["alisamento", "escova progressiva"], definicao: "Tratamento que alisa e reduz o volume do cabelo por algumas semanas ou meses." },
      { termo: "Hidratação", sinonimos: ["hidratacao capilar"], definicao: "Tratamento que repõe água e nutrientes no fio, deixando o cabelo mais macio." },
      { termo: "Limpeza de pele", sinonimos: ["facial", "skincare"], definicao: "Procedimento estético que remove impurezas e cravos e prepara a pele para outros cuidados." },
      { termo: "Drenagem linfática", sinonimos: ["drenagem"], definicao: "Massagem suave que estimula a circulação da linfa e reduz inchaço." },
      { termo: "Plano mensal", sinonimos: ["mensalidade", "membership", "assinatura"], definicao: "Pagamento fixo por mês que dá direito a um número de sessões ou ao uso livre do espaço." },
      { termo: "Avaliação física", sinonimos: ["assessment"], definicao: "Medição de peso, medidas e condicionamento para montar o treino ou acompanhar a evolução." },
    ],
    sinonimos: [["horario", "agenda", "vaga", "appointment"], ["corte", "cabelo", "haircut"], ["plano", "mensalidade", "membership"]],
    frases: {
      agendamento: ["marcar horário", "agendar um corte", "tem vaga hoje", "book an appointment"],
    },
  },
  {
    id: "turismo",
    nome: "Turismo e hotelaria",
    sinais: [["hotel", 3], ["pousada", 3], ["hosped", 3], ["diaria", 3], ["check-in", 3], ["checkin", 3], ["reserva", 2], ["quarto", 1], ["suite!", 2], ["viagem", 3], ["pacote!", 2], ["passeio", 3], ["roteiro", 2], ["turis", 3], ["booking", 2], ["travel", 3], ["tour!", 3], ["passagem", 3], ["hostel", 3]],
    schema: ["Hotel", "LodgingBusiness", "TravelAgency", "TouristAttraction", "BedAndBreakfast", "Resort"],
    glossario: [
      { termo: "Diária", sinonimos: ["nightly rate", "noite"], definicao: "Preço de uma noite de hospedagem, normalmente do horário de check-in até o de check-out do dia seguinte." },
      { termo: "Check-in", sinonimos: ["entrada", "checkin"], definicao: "Momento de chegada e registro do hóspede; a hospedagem define o horário a partir do qual o quarto fica disponível." },
      { termo: "Check-out", sinonimos: ["saida", "checkout"], definicao: "Horário limite para desocupar o quarto no último dia da hospedagem." },
      { termo: "Pensão completa", sinonimos: ["full board", "all inclusive", "meia pensao"], definicao: "Hospedagem com café da manhã, almoço e jantar incluídos (meia pensão inclui duas refeições)." },
      { termo: "No-show", sinonimos: ["nao comparecimento"], definicao: "Quando o hóspede não aparece e não cancela a reserva; pode haver cobrança conforme a política." },
      { termo: "Taxa de turismo", sinonimos: ["taxa de preservacao", "tourist tax"], definicao: "Valor cobrado por algumas cidades por pessoa ou por noite, à parte da diária." },
      { termo: "Pacote de viagem", sinonimos: ["package", "pacote"], definicao: "Conjunto vendido junto: transporte, hospedagem e, às vezes, passeios e refeições." },
    ],
    sinonimos: [["reserva", "reservar", "booking", "book"], ["quarto", "suite", "acomodacao", "room"], ["diaria", "noite", "night", "preco"], ["passeio", "tour", "excursao"]],
    frases: {
      reserva: ["quero reservar", "fazer uma reserva", "tem quarto disponível", "book a room", "check availability"],
    },
  },
];

// Setor genérico: sempre disponível, sem glossário. Usado quando nenhum setor se destaca.
export const GENERIC = { id: "geral", nome: "Geral", sinais: [], schema: [], glossario: [], sinonimos: [], frases: {} };

export const sectorById = (id) => SECTORS.find((s) => s.id === id) || (id === "geral" ? GENERIC : null);
