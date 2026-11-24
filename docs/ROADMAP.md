# Roadmap do Agent Generator (a partir da 0.7)

> Atualizado em 24/11/2026 com a 0.10 (conversa guiada e proatividade). A conversa guiada, que
> estava prevista para a 0.9, entrou na 0.10.

Objetivo: chegar perto do limite do que um agente **local, gratuito e sem IA obrigatória**
consegue fazer, e deixar a IA opcional só para o que realmente precisa dela. A pesquisa que
justifica cada item está em [PESQUISA-AGENTES.md](PESQUISA-AGENTES.md). O histórico anterior
(0.3 a 0.6) continua em [MELHORIAS.md](MELHORIAS.md).

Legenda: ✅ feito · 🔜 próxima versão · ⏳ depois

## 0.7 — Domínio, conteúdo e interações ✅ (23/11/2026)

| # | Item | Situação |
| --- | --- | --- |
| H1 | **Bases comuns por setor**: 12 setores com sinais (pt/en), glossário, sinônimos bilíngues, frases típicas e assuntos de cobertura; detecção no raio X e de novo na observação; `setor` no CLI e `--setor` para escolher à mão | ✅ |
| H2 | **Base complementar de conteúdos**: seções informativas viram resumos extrativos (TextRank) com link para o original; README e docs técnicos ficam de fora | ✅ |
| H3 | **Mapa de interações**: 18 tipos (compra, orçamento, agendamento, candidatura, parceria...) a partir de formulários, schema.org, páginas, links e observação; resposta com para que serve, campos, login e botão | ✅ |
| H4 | **Recuperação em etapas**: "Você quis dizer...?" com candidatos e "Nenhuma dessas"; na 2ª falha seguida, atendimento humano | ✅ |
| H5 | Busca com sinônimos do setor (sinônimo vale 60%; a melhor parte do texto conta) | ✅ |
| H6 | Avaliação e cobertura sensíveis ao setor (clínica não é cobrada por frete) | ✅ |
| H7 | FAQ técnica dos docs (deploy, npm...) fora do agente | ✅ |

Arquivos novos na base: `setor.json`, `conteudos.json`, `interacoes.json`
([DOMINIO-CONTEUDO-INTERACOES.md](DOMINIO-CONTEUDO-INTERACOES.md)).

## 0.8 — Contexto, mídia e conversa natural ✅ (23/11/2026)

Base: [PESQUISA-MERCADO.md](PESQUISA-MERCADO.md) (Tidio Lyro, Intercom Fin, Zendesk, Chatbase,
Crisp, Botpress, Voiceflow, Hyperleap). Uso: [CONTEXTO-E-MIDIA.md](CONTEXTO-E-MIDIA.md).

| # | Item | Situação |
| --- | --- | --- |
| L1 | **Galerias de fotos** (`midias.json`): fotos de conteúdo agrupadas por empreendimento/página e etapa/seção, com legenda e data (figcaption, `<time>`, `data-etapa`, data no arquivo); logos e ícones fora | ✅ |
| L2 | **Foto no chat**: "última foto da área de lazer" mostra a imagem, a data e o botão "Ver todas as fotos de ..." (âncora da seção); "foto anterior/próxima/primeira", por data e por grupo | ✅ |
| L3 | **Perfil da pessoa logada** (`perfil.json`): moldes por setor (12 setores + geral) com `{campos}`, trechos opcionais `[...]`, apelidos; sem dados pede login; campo faltando não é inventado | ✅ |
| L4 | **Três jeitos de receber os dados** (fonte do próprio site, `agente.identificar`, JSON na página), só em `sessionStorage` por 15 min, sem campos sensíveis; servidor nunca recebe os dados | ✅ |
| L5 | **Perfil + foto**: "como está a obra do meu apartamento?" responde com etapa, % e a foto mais recente da etapa no empreendimento da pessoa | ✅ |
| L6 | Observação descobre a fonte do perfil (`/api/me`, `/api/minha-...`) só pelos nomes dos campos e liga se algum molde fecha | ✅ |
| L7 | CLI `perfil` (`--fonte`, `--ativar`, `--desativar`, `--testar usuario.json`) | ✅ |
| L8 | **Várias perguntas numa frase** respondidas em ordem, com o assunto citado e botões nomeados (era I8 em parte) | ✅ |
| L9 | **Tom** (amigável/formal/neutro) com aberturas que não se repetem; **perguntas relacionadas** depois da FAQ (era I8) | ✅ |
| L10 | **Empatia**: frustração vira acolhimento + contatos, não "não entendi" | ✅ |
| L11 | Nome da pessoa na saudação e nas respostas; indicador de "digitando" (respeita reduzir movimento) | ✅ |
| L12 | **Passagem para humano com resumo**: WhatsApp abre com as últimas perguntas (era I2) | ✅ |
| L13 | Setor construção com termos de incorporadora (habite-se, fundação, alvenaria, acabamento, vistoria, incorporação) | ✅ |

## 0.9 — Instalador visual ✅ (24/11/2026)

| # | Item | Status |
| --- | --- | --- |
| V1 | **`agente-instalador`**: janela com etapas (boas-vindas, pasta, raio X, funcionalidades, aparência, instalação, teste, etapa 2), cada uma com as instruções do que fazer | ✅ |
| V2 | **Funcionalidades com checkbox**, só as críticas: catálogo, busca, dados da conta (sensível), perfil (sensível), formulários, fotos, conversas em etapas; o que não foi encontrado fica em cinza | ✅ |
| V3 | `agente.recursos` + `activeView`: desligar não apaga a base; avaliação, widget e IA opcional respeitam | ✅ |
| V4 | Ações críticas (pagamento, login, excluir, dados pessoais) mostradas como sempre bloqueadas | ✅ |
| V5 | Aparência com prévia (nome, cor, tom, lado, primeira mensagem) | ✅ |
| V6 | Instalação com progresso real, conversa de teste e acerto por área dentro da janela | ✅ |
| V7 | **Etapa 2 sem fechar o instalador**: treino, observação (com endereço do site ou `npm run dev`) e editor da base | ✅ |
| V9 | **Desinstalador**: o executável detecta um agente criado por ele e oferece desinstalar (widget fora das páginas, pasta apagada só se for nossa, base guardada); comando `desinstalar` | ✅ |
| V8 | Windows sem terminal (subsistema GUI no cabeçalho PE), Edge/Chrome em modo aplicativo, fecha sozinho quando a janela some | ✅ |

## 0.10 — Conversa guiada e proatividade ✅ (24/11/2026)

Uso e exemplos: [CONVERSA-GUIADA.md](CONVERSA-GUIADA.md).

| # | Item | Situação |
| --- | --- | --- |
| M1 | **Pergunta de esclarecimento por lacuna**: "fotos da área de lazer" com 2 empreendimentos → "De qual? Parque Verde ou Residencial Sol"; a resposta vale para as próximas perguntas | ✅ |
| M2 | **Mensagem proativa** por página (galerias e formulários), 1 por sessão, configurável (`agente.proativas`) | ✅ |
| M3 | **Fora do escopo por setor** (`setor.fora`): "vocês vendem carro?" numa construtora diz que não é com a gente | ✅ |
| M4 | **BM25** ordena a busca; a cobertura continua decidindo se responde | ✅ |
| M5 | **Confirmação antes de levar a uma interação com login** (e `/contato` deixou de contar como área logada) | ✅ |
| M6 | **Captura de contato conversacional**: nome + e-mail/telefone perguntados um a um, conferidos, e o formulário do próprio site preenchido para a pessoa enviar (funcionalidade `preencher`) | ✅ |
| M7 | Resposta curta/detalhada ("Explicar melhor" mostra `conteudos[].detalhe`) | ✅ |
| M8 | Vídeos (YouTube/Vimeo/arquivo do site) e PDFs como cartões (`midias.videos`, `midias.arquivos`) | ✅ |
| M9 | **Perfil com listas** (várias unidades/pedidos): "De qual?", resposta por item, "todas" e item citado na frase | ✅ |

## 1.0 — Medição, idiomas e plataforma ⏳

| # | Item |
| --- | --- |
| N1 | **Painel do dono** (modo servidor): perguntas mais feitas, taxa de "não entendi" (meta < 10%), fotos e interações mais pedidas, CSAT de 1 clique (era J2) |
| N2 | **Simulações**: conversas de teste salvas e repetidas a cada mudança da base, com diferença antes/depois |
| N3 | Respostas em inglês/espanhol quando o site está nesse idioma (era J3) |
| N4 | Editor visual das bases novas: glossário, conteúdos, interações, galerias e moldes de perfil (era I6) |
| N5 | Glossário próprio do site sugerido no `aprender` (era I7) |
| N6 | Atualização incremental que preserva edições (era J5); setores por contribuição (era J4) |
| N7 | Catálogo de ações (`acoes.json`) + servidor MCP (eram K1/K2); verificação de domínio (K3); npm e executável assinado (K4) |

## Como cada versão é validada

- Testes automáticos (`npm test`), incluindo um site de exemplo por setor novo
  (`tests/fixtures/`).
- `agent-generator avaliar`: acerto geral e a parte "Glossário do setor, conteúdos e
  interações".
- Teste em projeto real (Violet Voltage e o café de exemplo) antes de publicar a versão.
- 0.8: fixture `tests/fixtures/construtora/` (2 empreendimentos, 6 galerias, 11 fotos) e teste do
  widget num navegador de verdade (foto carregada, login pedido, perfil completado, sem erros).
- 0.10: fixture da construtora com vídeo e PDF; conversa guiada testada no navegador de verdade
  (convite proativo, cartões, fora do escopo, captura de contato e formulário preenchido em outra
  página, sem erros no console).
- 0.9: instalador percorrido de ponta a ponta num navegador de verdade (8 etapas, instalação,
  conversa de teste, treino iniciado e encerrado, sem erros no console) e teste de fumaça do
  executável no CI (`scripts/smoke-instalador.mjs`).
