# Pesquisa de mercado: agentes de atendimento em sites (novembro de 2026)

Objetivo: ver o que os agentes comerciais oferecem hoje, separar o que **depende de um modelo
de linguagem (LLM)** do que **dá para fazer localmente, sem custo e sem mandar dados para fora**,
e transformar isso em itens do [ROADMAP.md](ROADMAP.md). A pesquisa anterior (0.7, técnicas de
recuperação e setores) está em [PESQUISA-AGENTES.md](PESQUISA-AGENTES.md).

Fontes consultadas (documentação oficial e materiais dos fabricantes, lidos em 23/11/2026):
Tidio Lyro (help.tidio.com, tidio.com/editions, tidio.com/blog/lyro-conversational-ai),
Intercom Fin (intercom.com/help: "Fin AI Agent explained", "Fin Procedures explained",
"Fin Tasks explained"), Zendesk (support.zendesk.com: AI agents, proactive messages,
agent copilot), Chatbase (chatbase.co/docs: identity verification, contacts, collect leads,
product overview), Crisp (crisp.chat/en/chatbot), Botpress (botpress.com/docs: mensagens
ricas), Voiceflow (docs: carrossel), Hyperleap (blog: rich cards), ReLU.chat (blog: composição
de fragmentos), Amazon/arXiv 2210.14379 (modelo de resposta por recuperação) e o livro
*Effective Conversational AI* (Manning, capítulo de RAG).

## 1. O que os líderes oferecem

| Recurso | Quem tem | Como funciona lá |
| --- | --- | --- |
| Respostas só a partir do conteúdo do cliente | Tidio Lyro, Intercom Fin, Chatbase, Crisp | Lê site, FAQ, PDFs e catálogo; responde só com isso e passa para humano quando não sabe |
| Cartões de produto e carrossel no chat | Tidio (cartão com imagem, preço, variação e "adicionar ao carrinho"), Botpress, Voiceflow, Chatbase | Mensagem estruturada: imagem + título + botão, em vez de parágrafo |
| Ativos viram cartões (fotos, PDFs, vídeos) | Hyperleap | O dono sobe fotos e documentos; o agente mostra o ativo certo como cartão no momento certo |
| Usuário identificado (nome, plano, dados da conta) | Intercom (Identity Verification + atributos), Chatbase (JWT + contatos + metadados), Tidio (Contact Properties) | O site assina quem está logado; o agente usa nome, cidade, plano e dados próprios para personalizar |
| Ações em sistemas (pedido, reembolso, agendamento) | Tidio Actions/MCP, Fin Data connectors/Procedures, Zendesk AI agents | Chamadas de API autenticadas no meio da conversa |
| Procedimentos em etapas | Fin Procedures, Tidio Procedures, Zendesk procedures | Passo a passo escrito em linguagem natural, com condições e código para regras rígidas |
| Mensagem proativa | Tidio Proactive Lyro, Zendesk proactive messages, Crisp | Abre a conversa por página vista, visita repetida, carrinho ou formulário abandonado; com frequência controlada |
| Captura de contato (lead) | Chatbase Collect Leads, Tidio, Crisp | Formulário no chat ou perguntas uma a uma; nunca inventa valores; e-mail ou telefone obrigatório |
| Passagem para humano com histórico | Todos | O atendente recebe o histórico; fora do horário vira ticket |
| Sugestões de lacunas | Tidio Suggestions, Fin Suggestions, Chatbase | Perguntas não respondidas viram sugestões de conteúdo novo |
| Tom de voz e tamanho da resposta | Fin, Tidio Guidance | Profissional, amigável, curto ou detalhado |
| Público (audiences) | Fin, Tidio | Conteúdo diferente por plano, país, tipo de cliente |
| Multilíngue | Fin (45+), Tidio (51), Crisp | Responde no idioma da pessoa |
| Pesquisa de satisfação (CSAT) | Tidio, Crisp, Fin (CX Score) | Pergunta no fim da conversa |
| Simulações e testes de regressão | Fin Simulations, Chatbase | Conversas de teste repetidas a cada mudança |
| Painel e tópicos | Fin, Chatbase, Tidio Analytics | Temas mais pedidos, taxa de resolução, vendas atribuídas |
| Visão (ler imagem enviada) | Fin Vision, Lyro | Depende de modelo multimodal |

## 2. O que é exclusivo de LLM e o que não é

| Precisa de LLM (fica para a IA opcional) | Dá para fazer local, sem IA |
| --- | --- |
| Escrever texto novo, livre, sobre qualquer coisa | Montar a resposta com **trechos verificados** da base, ligados por conectores ("Sobre X:", "E sobre Y:") — a abordagem de "composição de fragmentos" que o ReLU.chat adotou justamente para não alucinar |
| Entender frases muito fora do que foi treinado | Classificador + busca com sinônimos do setor + "Você quis dizer...?" (0.7); a IA opcional só reescreve a frase (0.6) |
| Ler imagem enviada pelo cliente | Mostrar imagens do próprio site (galerias, produtos) |
| Resumir textos de forma abstrata | Resumo **extrativo** (TextRank, 0.7) |
| Procedimentos descritos em linguagem natural | Fluxos em etapas com opções e condições (0.3) |
| Tradução livre | Textos fixos por idioma + glossário bilíngue |

O artigo da Amazon (arXiv 2210.14379) explica por que empresas preferem **recuperar** respostas
de um conjunto aprovado em atendimento real: com geração livre "é quase impossível dar garantias
de estilo, qualidade e privacidade". O livro da Manning recomenda o mesmo critério que já usamos:
se a busca não acha evidência, **não gerar** a partir de resultado fraco; dizer que não achou e
oferecer uma pessoa.

## 3. Como parecer uma IA generativa sem ser uma

Técnicas aplicadas na 0.8 (✅) ou planejadas (🔜), todas determinísticas:

1. ✅ **Várias perguntas numa frase**: "qual o horário e vocês aceitam financiamento?" vira duas
   respostas, cada uma com o assunto citado, e botões com o assunto ("Saiba mais: horário").
2. ✅ **Abertura variada pelo tom** (amigável, formal, neutro), sem repetir a da volta anterior.
3. ✅ **Perguntas relacionadas** depois de uma resposta da FAQ (como os assistentes de IA
   sugerem "você também pode perguntar...").
4. ✅ **Empatia**: frase de frustração ("absurdo", "ninguém responde") recebe acolhimento e o
   caminho para a equipe, em vez de "não entendi".
5. ✅ **Nome da pessoa** na saudação e nas respostas de perfil (Intercom e Chatbase fazem isso
   com o usuário identificado).
6. ✅ **Indicador de "digitando"** proporcional ao tamanho da resposta (até 1,2 s; desligado com
   "reduzir movimento").
7. ✅ **Mídia no chat**: a foto certa aparece na conversa (Hyperleap/Botpress), com botão para a
   galeria completa.
8. ✅ **Memória de curto prazo**: "foto anterior", "a primeira", "o segundo", "e em azul?".
9. ✅ **Passagem para humano com resumo**: o link do WhatsApp já leva as últimas perguntas.
10. 🔜 **Pergunta de esclarecimento por lacuna** ("Para qual empreendimento?") quando falta um
    dado para responder (slot filling).
11. 🔜 **Mensagem proativa** por página e por evento, uma por sessão.
12. 🔜 **Respostas em tamanhos** (curta/detalhada), escolhidas pelo tom ou pela pergunta
    ("explica melhor").

## 4. O exemplo da construtora e as variações por setor

Pedido: a pessoa logada pergunta pelo andamento da obra do apartamento dela e quer ver a
última foto da área de lazer; o agente mostra a foto e oferece a página com todas as fotos
daquela etapa. Isso combina dois recursos que o mercado vende separados — **usuário
identificado** (Intercom/Chatbase) e **ativos como cartões** (Hyperleap) — com a nossa regra:
os dados da pessoa ficam no navegador dela (sessão), nunca num banco do agente.

| Setor | Perfil da pessoa logada (perfil.json) | Galerias (midias.json) |
| --- | --- | --- |
| Construção / incorporação | Andamento da obra da unidade, etapa, % concluído, previsão de entrega | Fotos por etapa: fundação, estrutura/torre, lazer, utilitários; por empreendimento |
| Imobiliário | Visita agendada, situação da proposta/contrato | Fotos por imóvel e cômodo |
| Varejo / e‑commerce | Último pedido, status, rastreio, pontos/cashback | Fotos de produto por categoria, lookbook |
| Alimentação | Pedido saindo, previsão, fidelidade | Cardápio por categoria (pratos, bebidas) |
| Logística | Rastreio do envio, previsão | Fotos de frota/estrutura (institucional) |
| Finanças | Próxima fatura, vencimento, plano | — (normalmente sem galeria) |
| Tecnologia / SaaS | Plano e renovação, chamados abertos | Capturas de tela por recurso |
| Saúde | Próxima consulta, profissional, exames prontos | Estrutura da clínica, equipe |
| Educação | Próxima aula, notas, frequência | Fotos do campus, eventos por semestre |
| Jurídico | Andamento do processo, última movimentação | — |
| Beleza | Próximo horário, sessões restantes do pacote | Antes e depois por serviço |
| Turismo | Reserva, destino, data, situação | Fotos por destino e por dia do roteiro |

Todos os moldes estão em `src/domain/profile.js` e são gerados **desligados**; o dono liga com
`agent-generator perfil <pasta> --fonte /api/minha-conta` (ou a observação liga sozinha quando
vê essa chamada com a sessão e os campos combinam com algum molde).

## 5. Ideias do mercado que NÃO vamos copiar (e por quê)

- **Executar compras, reembolsos e alterações de conta pelo chat**: exige chamadas autenticadas
  que mudam dados; o risco e a responsabilidade ficam com o site. O agente continua levando à
  página certa (e, na 0.9, preenchendo o formulário para a pessoa conferir e enviar).
- **Treinar com conversas antigas de outra ferramenta**: dados pessoais de terceiros; fora da
  proposta local e sem custo.
- **Visão / leitura de imagem enviada**: só com modelo multimodal (IA opcional, se um dia fizer
  sentido).
