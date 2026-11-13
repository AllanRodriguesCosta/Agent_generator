# Próximas melhorias (roadmap)

O que falta para o agente gerado deixar de parecer "um chatbot que responde 5 frases" e para o
raio X entender melhor cada projeto. Tudo continua **sem custo**. A IA, quando aparece, é opcional
e gratuita. Ordem sugerida: primeiro o que dá mais resultado com menos código.

## A. Raio X mais completo (o agente sabe mais)

| # | Melhoria | Por que importa |
| --- | --- | --- |
| A1 | ✅ (0.3, pela observação) **Ler o site rodando** (`--url http://localhost:3000`): visitar as páginas como um navegador e ler o texto final | Sites React/Vue/Next montam o texto em JavaScript; hoje o raio X lê só o código-fonte e perde parte do conteúdo |
| A2 | `sitemap.xml`, `robots.txt`, `<meta description>`, Open Graph e títulos | Nome, descrição e lista de páginas mais fiéis, com pouco esforço |
| A3 | ✅ (0.3, pela observação) **Catálogo vindo da API** do próprio site (detectar `GET /api/produtos` e testar com o site rodando) e de seeds/migrações SQL | Hoje o catálogo vem de JSON/CSV no repositório; muitos projetos guardam no banco |
| A4 | ✅ (0.3) **Formulários viram tarefas**: campos obrigatórios, validações, para onde enviam | O agente explica "como me cadastro", "o que preciso para agendar" com os campos reais |
| A5 | ✅ (0.3) **Páginas que pedem login** (rotas protegidas por middleware) | O agente avisa "para ver pedidos, entre na sua conta", como na Violet Voltage |
| A6 | Textos de `i18n/locales` e mensagens de erro do código | Respostas para "deu erro X" e suporte a sites em inglês/espanhol |
| A7 | **Nota de cobertura** no relatório: o que o agente sabe e o que falta (sem horário, sem política de troca, sem contato...) | Mostra exatamente o que a pessoa precisa escrever na base |

## B. Agente mais "esperto" (sem modelo de linguagem)

| # | Melhoria | Exemplo |
| --- | --- | --- |
| B1 | ✅ (0.4) **Entidades** (slots) extraídas do catálogo: categoria, marca, cor, tamanho, faixa de preço | "tem tênis preto da Nike até 300?" filtra por 4 coisas de uma vez |
| B2 | ✅ (0.3, `fluxos.json` + modo treino) **Conversa em várias etapas** (máquina de estados configurável em `fluxos.json`): o agente pergunta o que falta | "quero um presente" → "para quem?" → "até quanto?" → 3 sugestões com o motivo |
| B3 | ✅ (0.4) **Memória da conversa**: "e o mais barato?", "e em azul?", "compara os dois" usam a última lista | Hoje só "mais opções" usa o contexto |
| B4 | ✅ (0.4, comparar) **Comparar itens** lado a lado e **recomendar com justificativa** ("este, porque cabe no orçamento e é o mais vendido") | Igual ao montador de setup da Violet Voltage, só que genérico |
| B5 | **Ações no site**: o widget dispara eventos (`agente:adicionar-carrinho`, `agente:abrir-pagina`, `agente:preencher-formulario`) que o site escuta | O agente deixa de só responder e passa a fazer |
| B6 | **"Você quis dizer...?"** com as 2 perguntas mais próximas quando a confiança é média | Menos "não entendi" |
| B7 | **Passar para um humano** com o resumo da conversa (WhatsApp/e-mail pré-preenchido) | Atendimento real quando o agente não sabe |
| B8 | **Tom e personalidade** configuráveis (formal, descontraído), variações de resposta e small talk | Deixa de soar repetitivo |
| B9 | Respostas com **cartões** (foto, preço, botão) e **respostas rápidas** dinâmicas por contexto | Mais parecido com assistentes de lojas reais |

## C. Aprender com o uso (melhora sozinho, sem IA)

| # | Melhoria |
| --- | --- |
| C1 | ✅ (0.4, `aprender` + modo treino) **Registro das frases não entendidas**, anônimo e local (opcional: enviado ao servidor do próprio site) e comando `agent-generator aprender` que mostra os grupos e sugere onde encaixar |
| C2 | ✅ (0.3, modo treino: Certo/Corrigir) Botões 👍/👎 em cada resposta, que alimentam a avaliação |
| C3 | `avaliar --relatorio html`: painel com acerto por intenção, confusões entre intenções e frases problemáticas |
| C4 | Gerar **frases de teste automaticamente** (variações com erro de digitação, sem acento, gírias) para a avaliação não ficar fácil demais |

## D. IA opcional e gratuita na hora de responder

| # | Melhoria | Custo |
| --- | --- | --- |
| D1 | **Plano B com IA** só quando o agente local não entende, usando como contexto apenas a base (RAG) e com conferência ("só responda com o que está no texto") | Gemini gratuito (chave do dono do site, no servidor `templates/servidor.js`, nunca no navegador) |
| D2 | **Modelo pequeno rodando no navegador** (WebLLM/Transformers.js) ou local (Ollama) para quem não quer chave nenhuma | Zero, mas pesado para celulares |
| D3 | **Busca semântica** com embeddings pré-calculados na geração (o visitante não baixa modelo) | Zero |

## E. Ferramenta (o "apk")

| # | Melhoria |
| --- | --- |
| E1 | ✅ **Executável com duplo clique** na pasta raiz (feito; ver [EXECUTAVEL.md](EXECUTAVEL.md)) |
| E2 | ✅ (0.4, `editar`) **Interface no navegador** para editar a base (lista de perguntas, testar na hora, ver acerto) em vez de editar JSON |
| E3 | Atualização incremental: rodar de novo **mescla** páginas e perguntas novas com a base editada, em vez de "manter tudo" ou "regerar tudo" |
| E4 | Plugins para frameworks (componente React/Vue, `next.config` automático) e instalação no `layout` com confirmação |
| E5 | Publicar no npm (`npx agent-generator`) e assinar o executável do Windows (gratuito via SignPath para código aberto) para tirar o aviso do SmartScreen |

## F. Feito na 0.3: observar e treinar

- **Observação** (`observar` e passo 4b do assistente): proxy local com gravador; aprende páginas,
  formulários, busca, login, catálogo da API e consultas da conta.
- **Consultas ao vivo** (`consultas.json`): "onde está meu pedido?" lido da API do site com a
  sessão de quem está logado.
- **Treino** (`treinar` e executável `agente-treinador`): Certo/Corrigir em cada resposta, com
  salvamento na hora e conversas em etapas.
- Detalhes: [OBSERVAR-E-TREINAR.md](OBSERVAR-E-TREINAR.md).

Próximos passos naturais: B1 (entidades como cor e tamanho), B3 (memória "e em azul?"), C1 (frases
não entendidas no site publicado alimentando o treino) e E2 (editor visual da base). Feitos na 0.4:
ver [APRENDER-E-EDITAR.md](APRENDER-E-EDITAR.md).

## Sugestão de ordem

1. **E3 + A7 + C1**: a base fica viva e a pessoa sabe o que falta.
2. **B1 + B3 + B6**: o salto de "responde frases" para "conversa".
3. **B2 + B4 + B5**: fluxos e ações, que é onde o agente da Violet Voltage já está.
4. **A1 + A3**: projetos React/Next e catálogos em banco.
5. **D1**: IA só como plano B, com a mesma regra de nunca inventar.
