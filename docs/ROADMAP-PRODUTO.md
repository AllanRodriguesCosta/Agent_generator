# Roadmap de produto: chatbot local com IA sob controle

Este roadmap mantém o objetivo central do Agent Generator: qualquer pessoa deve conseguir criar e
publicar um chatbot útil para o próprio site, sem chave, mensalidade ou IA obrigatória. Quando uma
IA externa ou local for ativada, ela deve ampliar a compreensão da conversa; ela não ganha poder
para executar ações que a base gerada não aprovou.

## Princípios inegociáveis

1. **Local primeiro.** Perguntas, intenções, FAQ e navegação funcionam sem serviço de IA.
2. **Capacidade antes de linguagem.** A IA pode escolher entre capacidades cadastradas; nunca
   inventar URL, comando, preço, formulário ou chamada de API.
3. **Negar por padrão.** Qualquer operação que não estiver no catálogo de capacidades é recusada.
4. **Sem efeito colateral sem confirmação.** Operações que criem, alterem, enviem ou excluam algo
   serão bloqueadas por padrão e, quando existirem, pedirão confirmação humana no servidor.
5. **Explicável e reversível.** O dono do site vê a origem de cada resposta, revisa a base, testa
   antes de publicar e pode voltar a uma versão anterior.

## Fase 1 — Base local confiável e escopo explícito

| Entrega | Estado | Resultado para quem usa |
| --- | --- | --- |
| Raio X de projeto e site publicado | Feito | Páginas, FAQ, catálogo, contato e formulários conhecidos sem ler segredos. |
| Widget, editor, avaliação e treino | Feito | Instala, corrige e mede a base sem editar código. |
| IA opcional como intérprete | Feito | A IA reescreve pergunta desconhecida; a resposta continua vindo da base. |
| `acoes.json`: catálogo de capacidades | Iniciado nesta versão | O agente recebe uma lista audível de navegações permitidas; a política é `negar` por padrão. |
| Avaliação de sinônimos e lacunas | Próximo | O relatório indicará perguntas críticas, variações não cobertas e conflitos de intenção. |

**Critério de saída:** todo agente publicado deve ter uma avaliação, uma lista de lacunas e um
catálogo de capacidades revisável.

## Fase 2 — Console visual sem programação

1. Substituir o fluxo de perguntas do executável por um assistente gráfico: escolher pasta ou URL,
   revisar o scan, personalizar o widget, testar e publicar.
2. Exibir páginas encontradas, FAQ, perguntas sem resposta e capacidades em linguagem simples.
3. Permitir aprovar, desativar e renomear cada capacidade; mostrar riscos antes de publicar.
4. Manter versões da base e oferecer comparação/restauração.
5. Produzir um relatório portátil de privacidade e de escopo para o dono do site.

**Critério de saída:** uma pessoa sem experiência em programação consegue publicar um chatbot
local em menos de dez minutos, entendendo o que ele sabe e o que ele nunca fará.

## Fase 3 — Integrações de publicação

1. Gerar snippet de instalação com verificação de caminho base, CSP e domínio.
2. Criar plugin WordPress: scan de conteúdo público, editor, widget em `wp_footer` e atualização
   quando postagens forem publicadas.
3. Oferecer modo hospedado separado para o fallback de IA, com CORS, limite de requisições e chave
   guardada somente no servidor.
4. Incluir diagnóstico de publicação: widget carregado, endpoint saudável, origem autorizada e
   links testados.

**Critério de saída:** WordPress e sites estáticos recebem o agente sem editar tema ou expor chave
de API no navegador.

## Fase 4 — IA limitada por contrato

1. Converter o catálogo em chamadas estruturadas, por exemplo
   `{ "acao": "navegar", "id": "abrir-contato" }`.
2. Validar no servidor tipo, argumentos, domínio, identidade e contexto antes de qualquer execução.
3. Separar níveis: navegação (automática), preparação de formulário (prévia), escrita/compra/
   publicação (aprovação humana obrigatória).
4. Registrar proposta, decisão e resultado; interromper se a validação falhar.
5. Só então expor ações como ferramentas para Gemini, outros LLMs ou MCP.

**Critério de saída:** nenhum modelo de linguagem possui acesso direto ao DOM, banco, checkout ou
API administrativa do site.

## Fase 5 — Operação responsável

1. Painel de perguntas sem resposta, taxa de clique, correções e custo de IA.
2. Exportação/importação da base, backup e atualização incremental sem apagar edições humanas.
3. Consentimento e retenção configuráveis; modo totalmente local e explicação clara quando dados
   são enviados a um provedor de IA.
4. Testes de regressão de intenções e teste de segurança das capacidades antes de cada publicação.

## Ordem imediata de execução

1. **Fase 1: catálogo de capacidades seguro** — iniciada agora.
2. Melhorar a avaliação com conjuntos de sinônimos e falsos entendimentos.
3. Implementar mesclagem incremental da base.
4. Criar o assistente gráfico e, em seguida, o plugin WordPress.
5. Adicionar ações estruturadas apenas depois de haver validação e aprovações no servidor.
