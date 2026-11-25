# Roadmap do Agent Generator (a partir da 0.7)

> Atualizado em 25/11/2026 com a 0.11 (sem código: chave de IA no instalador, serviço do agente na
> Cloudflare e site já publicado) e o plano de distribuição (landing page, download e receita).

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

## 0.11 — Sem código: chave de IA, serviço do agente e site já publicado ✅ (25/11/2026)

Ideias do Allan: (1) atribuir a chave da IA já no executável, abrindo uma guia para logar como o
Git faz; (2) usar a chave sem criar variável no Render ou Action no GitHub; (3) instalar o agente
num site que já está no ar, sem clonar, instalar e fazer novo deploy — para o software poder ser
baixado numa landing page e funcionar com "baixar, executar e receber o agente".
Uso e detalhes: [SEM-CODIGO.md](SEM-CODIGO.md).

**Chave de IA e serviço do agente**

| # | Item | Situação |
| --- | --- | --- |
| C1 | Etapa **Inteligência artificial** no instalador (pasta e site publicado): Sem IA, Gemini, OpenRouter ou compatível com OpenAI | ✅ |
| C2 | **OpenRouter em 1 clique**: o instalador abre o login no navegador e a chave volta sozinha (retorno em `127.0.0.1` + PKCE, sem cadastro de aplicativo); conta sem crédito usa modelo gratuito | ✅ |
| C3 | **Gemini assistido**: abre a página das chaves do Google AI Studio, botão Colar (área de transferência), teste na hora listando os modelos, erros em linguagem simples | ✅ |
| C4 | **Cofre local** das chaves na pasta do usuário (fora do projeto e do git, só o dono lê); a janela recebe só `sk-or…cdef`; "Esquecer a chave" | ✅ |
| C5 | **Serviço do agente na Cloudflare** (conta gratuita da pessoa), publicado pela API: chave como **segredo**, sem variável no Render e sem Action no GitHub; link do token já com as permissões; subdomínio `workers.dev` criado sozinho | ✅ |
| C6 | **Widget híbrido**: o agente continua no navegador e só a frase não entendida (anônima) vai ao serviço (`agente.ia.endpoint`); origem conferida, 6/min por visitante, teto por minuto e por dia | ✅ |
| C7 | Melhorar a base na instalação e conversa de teste com a IA conectada (Gemini, OpenRouter ou compatível), sem `GEMINI_API_KEY` | ✅ |
| C8 | CLI: `ia` (conectar, testar, esquecer) e `publicar` (`--token`, `--site`, `--remover`); `aprender` lê as frases guardadas pelo serviço (KV, 90 dias) | ✅ |

**Site já publicado, sem código e sem novo deploy**

| # | Item | Situação |
| --- | --- | --- |
| P1 | Instalador com dois caminhos: **Tenho a pasta do site** e **Meu site já está no ar** (só o endereço) | ✅ |
| P2 | Leitura do site pela janela (crawler da 0.6: robots.txt, sitemap, JSON-LD), com confirmação de autorização e redirecionamento seguido (com/sem `www`) | ✅ |
| P3 | Agente inteiro no serviço: widget, núcleo e base como **arquivos estáticos** da Cloudflare (grátis, fora do limite diário), com CORS | ✅ |
| P4 | **Uma linha para colar** + carregador para Google Tag Manager + **guia por plataforma** (WordPress, Wix, Shopify, Webflow, Squarespace, GTM, Blogger, HTML), com a plataforma detectada no HTML | ✅ |
| P5 | **Plugin WordPress** gerado (`agente-wordpress.zip`): Plugins > Adicionar novo > Enviar plugin | ✅ |
| P6 | **Prévia no site real** antes de colar a linha (cópia local: sem CSP, sem cookies, formulários não são enviados) | ✅ |
| P7 | **Verificar instalação**: linha na página, CSP do site e `/saude` do serviço | ✅ |
| P8 | Atualizar sem redeploy do site (editar a base, reler o site e publicar de novo) e **remover** (apaga o serviço) | ✅ |

## 0.12 — Distribuição: landing page, download e receita 🔜

Objetivo: transformar o "baixar, executar e receber o agente" em produto, com uma página de download
que se paga com anúncios no começo, antes de outros modelos de cobrança.

| # | Item |
| --- | --- |
| D1 | **Landing page** estática (GitHub Pages ou domínio próprio): download do instalador do sistema detectado, vídeo curto, prints, perguntas frequentes e um guia por plataforma (WordPress, Wix, Shopify...) — que também é conteúdo para busca |
| D2 | **Monetização inicial com AdSense**: domínio próprio (o `ads.txt` fica na raiz), páginas Sobre, Contato e Política de Privacidade (LGPD) com aviso de cookies, conteúdo original; anúncios **longe do botão de download** (a política do AdSense proíbe anúncio que pareça botão ou induza clique) |
| D3 | **Executável assinado**: sem assinatura o Windows mostra "O Windows protegeu o computador". Caminho gratuito para código aberto: SignPath Foundation (sujeito a aprovação); alternativa: certificado de assinatura de código. macOS: notarização (Apple Developer, pago) |
| D4 | **Aviso de atualização** no instalador (consulta a última Release do GitHub) |
| D5 | **Release enxuta**: só o instalador por sistema (3 arquivos, o gerador e o treinador continuam disponíveis no instalador) + SHA-256 de cada arquivo |
| D6 | Medição do funil: downloads pela API de Releases e telemetria **opcional** (opt-in, sem dado pessoal, com política de privacidade) de quais etapas as pessoas concluem |
| D7 | Instalador e landing page em **inglês e espanhol** (mais público para os anúncios) |
| D8 | **Modo hospedado** opcional mantido pelo projeto (quem não quer criar conta na Cloudflare): limites por site, custos e LGPD (o projeto vira operador dos dados) — base para um plano pago no futuro |

## 1.0 — Medição, idiomas e plataforma ⏳

| # | Item |
| --- | --- |
| N1 | **Painel do dono** (modo servidor): perguntas mais feitas, taxa de "não entendi" (meta < 10%), fotos e interações mais pedidas, CSAT de 1 clique (era J2) |
| N2 | **Simulações**: conversas de teste salvas e repetidas a cada mudança da base, com diferença antes/depois |
| N3 | Respostas em inglês/espanhol quando o site está nesse idioma (era J3) |
| N4 | Editor visual das bases novas: glossário, conteúdos, interações, galerias e moldes de perfil (era I6) |
| N5 | Glossário próprio do site sugerido no `aprender` (era I7) |
| N6 | Atualização incremental que preserva edições (era J5); setores por contribuição (era J4) |
| N7 | Catálogo de ações (`acoes.json`) + servidor MCP (eram K1/K2); verificação de domínio (K3); pacote no npm (K4; a assinatura do executável foi para a 0.12, D3) |

## Pesquisa (sem data)

| # | Item |
| --- | --- |
| R1 | **Gemini 100% automático** (sem copiar a chave): login do Google + API Keys do Google Cloud. Exige aplicativo OAuth verificado pelo Google (escopo `cloud-platform`, site e política de privacidade) e, desde maio/2026, chaves de autorização ligadas a conta de serviço. Depende da landing page (D1/D2). Hoje: assistido (C3) ou OpenRouter em 1 clique (C2) |
| R2 | **Entrar com GitHub** (device flow, como o Git): abrir um PR com o agente no repositório do cliente ou publicar a base no GitHub Pages |
| R3 | Outros destinos do serviço: Netlify, Deno Deploy, o próprio servidor (`servico.js` + Docker); Vercel só para uso não comercial (plano Hobby) |
| R4 | Plugin no diretório oficial do WordPress (instalar buscando "Agent Generator" e atualizar a base sozinho) |

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
- 0.11: Cloudflare, OpenRouter e Google simulados nos testes (nenhum teste sai para a internet); o
  serviço (Worker) roda no Node com o mesmo grafo de módulos publicado; os dois caminhos do
  instalador percorridos num navegador de verdade (OpenRouter em 1 clique, Gemini com chave errada e
  certa, Cloudflare, publicar, colocar no site, verificar, prévia e conversa com IA, sem erros de
  JavaScript no console).
