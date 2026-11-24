# Agent Generator

Faz um **raio X do seu projeto web** e cria um **agente (chatbot) personalizado** para ele: entende o
que o visitante escreve, responde as perguntas frequentes do site, leva às páginas certas e encontra
produtos ou serviços (inclusive por preço: "até R$ 100").

- **Sem custo e sem IA obrigatória.** O agente roda no navegador do visitante, com processamento
  de linguagem natural local (Naive Bayes e busca por relevância). A IA é opcional e gratuita: serve
  só para *melhorar a base*, nunca para responder em tempo real.
- **Não precisa programar nem treinar do zero.** Um comando lê o projeto, gera a base de
  conhecimento em JSON (editável à mão), instala o widget e mostra a porcentagem de acerto.
- **Funciona com qualquer site:** HTML estático, React, Vite, Next.js, Vue, Nuxt, SvelteKit,
  Angular, Astro, Express, Flask, Django, Laravel...
- **Aprende com você usando o site (0.3):** o executável observa alguns minutos de uso real e,
  na parte 2 (`agente-treinador`), você conversa com o agente no próprio site e corrige cada
  resposta com um clique. Ver [docs/OBSERVAR-E-TREINAR.md](docs/OBSERVAR-E-TREINAR.md).
- **Conversa de verdade e melhora com o uso (0.4):** entende cor, marca, tamanho e categoria do
  seu catálogo ("tem tênis preto da Nike até 300?"), lembra a última lista ("e em azul?", "o mais
  barato", "compara os dois", "me fala do segundo"), guarda as frases que não entendeu (sem dado
  pessoal) e o comando `aprender` sugere onde encaixar cada uma. A base também pode ser editada
  num **editor visual** no navegador. Ver [docs/APRENDER-E-EDITAR.md](docs/APRENDER-E-EDITAR.md).
- **Raio X mais completo e avaliação mais dura (0.5):** lê `sitemap.xml`, arquivos de tradução
  (`locales/`, com perguntas frequentes em JSON), `metadata` do Next.js e as mensagens de erro do
  código; a avaliação gera frases com erro de digitação, sem acento e informais, mostra os
  **assuntos que faltam** na base (horário, trocas, privacidade...) e sai em HTML
  (`avaliar --variacoes --html`). Consultas da conta funcionam também com login por token.
- **Site já publicado, sem o código (0.6):** `site https://minhaloja.com.br` lê as páginas
  públicas (respeitando o `robots.txt`), o catálogo (schema.org, Shopify, WooCommerce, APIs
  públicas) e cria um **serviço pronto para publicar à parte** (Render gratuito, Docker...). O site
  só ganha duas linhas e não sai do ar. **IA opcional** (Gemini, OpenAI ou Ollama local) só
  reescreve o que o agente não entendeu: quem responde continua sendo a base. Ver
  [docs/SITE-PUBLICADO.md](docs/SITE-PUBLICADO.md).
- **Setor, conteúdos e interações (0.7):** o raio X descobre o **setor** do site (12 bases
  comuns: varejo, saúde, logística, contabilidade, arquitetura, tecnologia...) e traz um
  **glossário** com sinônimos em português e inglês ("o que é carência?", "what is shipping?");
  transforma as seções informativas em **resumos** com link para o original (sem inventar: as
  frases são do próprio site); e monta o **mapa de interações** (comprar, pedir orçamento,
  agendar, se candidatar, ser fornecedor...), explicando para que serve cada uma, o que a pessoa vai
  informar e levando até a página. Quando não entende, pergunta "Você quis dizer...?" e, na
  segunda vez, oferece o atendimento humano. Ver
  [docs/DOMINIO-CONTEUDO-INTERACOES.md](docs/DOMINIO-CONTEUDO-INTERACOES.md) e o
  [roadmap](docs/ROADMAP.md).
- **Fotos, perfil da pessoa logada e conversa natural (0.8):** o raio X monta **galerias** com as
  fotos de cada página por etapa/seção ("última foto da área de lazer" mostra a foto no chat e o
  botão para a galeria completa). Com o **perfil** ligado, o agente responde sobre os dados de quem
  está logado ("como está a obra do meu apartamento?" → etapa, % e a foto da etapa), com moldes
  por setor e os dados só na aba do navegador. Responde **várias perguntas numa frase**, varia o
  tom, sugere perguntas relacionadas, acolhe reclamações e leva o resumo da conversa ao WhatsApp.
  Ver [docs/CONTEXTO-E-MIDIA.md](docs/CONTEXTO-E-MIDIA.md) e a
  [pesquisa de mercado](docs/PESQUISA-MERCADO.md).
- **Instalador visual (0.9):** o `agente-instalador` abre uma **janela com etapas**, como os
  instaladores de programas do Windows, com as instruções do que fazer em cada etapa: pasta do
  projeto, raio X, **funcionalidades com checkbox** (catálogo, busca, dados da conta, perfil,
  formulários, fotos, conversas em etapas; as ações críticas ficam sempre bloqueadas), aparência
  com prévia, instalação com progresso e conversa de teste. Depois de instalar, ele **continua
  aberto** para a etapa 2 (treino assistido, observação e editor da base). Se o projeto já tem
  um agente criado por ele, oferece **desinstalar** (tira o widget das páginas e apaga a pasta do
  agente, guardando a base antes). No Windows não abre terminal. Ver [docs/INSTALADOR.md](docs/INSTALADOR.md).
- **Feito para IAs de código também:** `--json` em todos os comandos e um guia passo a passo
  ([GUIA-PARA-IA.md](GUIA-PARA-IA.md)) para Copilot, Codex, Claude Code, Cursor etc. automatizarem tudo.

O motor de linguagem veio do assistente da loja
[Violet Voltage](https://github.com/AllanRodriguesCosta/violet-voltage-ecommerce), reescrito para
servir a qualquer projeto.

<p align="center"><img src="docs/img/widget-desktop.png" alt="Widget do agente aberto no site de exemplo, respondendo sobre contato com botões de WhatsApp e página de contato" width="640"> <img src="docs/img/widget-celular-escuro.png" alt="O mesmo widget no celular, em tema escuro" width="200"></p>

## Jeito mais fácil: executável (sem instalar nada)

1. Baixe o **`agente-instalador`** do seu sistema na página **Releases** (Windows `.exe`, Linux ou macOS).
2. Coloque o arquivo na **pasta raiz do seu site** (onde fica o `index.html` ou o `package.json`).
3. Dê dois cliques. Abre uma janela com as etapas e as instruções de cada uma: confira a pasta,
   veja o raio X, marque as funcionalidades, escolha nome e cor e clique em **Instalar**. Depois,
   converse com o agente e siga para a etapa 2 (treino) sem fechar a janela.

<p align="center"><img src="docs/img/instalador-funcionalidades.png" alt="Instalador visual na etapa Funcionalidades, com as etapas à esquerda e os checkboxes" width="640"></p>

Prefere o terminal? O `agente-gerador` faz o mesmo com perguntas de sim/não.
Detalhes do instalador: [docs/INSTALADOR.md](docs/INSTALADOR.md).

Detalhes, avisos do Windows/macOS e o que ele altera: [docs/EXECUTAVEL.md](docs/EXECUTAVEL.md).
Quem já tem Node e Git pode usar o lançador leve da pasta [`lancadores/`](lancadores).

## Em 1 minuto (com Node)

Requisito: [Node.js](https://nodejs.org) 20 ou mais novo.

```bash
git clone https://github.com/AllanRodriguesCosta/Agent_generator.git
cd Agent_generator
node bin/agent-generator.js criar ../caminho/do/seu-projeto --inserir
node bin/agent-generator.js conversar ../caminho/do/seu-projeto
```

Pronto: o agente aparece no canto da tela das páginas do site. Para ver o exemplo incluído
(cafeteria "Café Aurora"):

```bash
npm run demo          # copia o exemplo para .demo/ e cria o agente nele
npm run demo:servir   # o mesmo e abre http://localhost:5173
```

## Como funciona

```
seu projeto ──► 1. raio X ──► relatorio.json ──► 2. gerar ──► conhecimento/*.json ──► 3. instalar ──► widget no site
                (páginas, rotas,                  (intenções, FAQ,            (núcleo + widget
                 FAQ, catálogo,                    páginas, catálogo)          na pasta pública)
                 contatos)                               ▲
                                                         │ opcional: IA de chat ou Gemini gratuito
                                                         │ acrescenta frases e perguntas (com conferência)
```

1. **Raio X** (`analisar`): lê HTML, JSX/TSX, Vue, Markdown, JSON/CSV e código de rotas. Encontra
   título e descrição do site, páginas e menus, formulários, perguntas frequentes (README,
   `<details>`, JSON-LD FAQPage, títulos com "?"), catálogos (listas de produtos/serviços em
   JSON/CSV ou rota de API) e contatos visíveis (e-mail, WhatsApp, horário). Nunca lê `.env` ou
   chaves, e não altera nada no projeto.
2. **Gerar** (`gerar`): transforma o relatório em 5 arquivos JSON simples. Só usa fatos encontrados;
   textos genéricos (cumprimentar, pedir ajuda, contato) vêm prontos com o nome do site.
3. **Instalar** (`instalar`): copia o núcleo e o widget para a pasta pública (`public/agente`,
   `static/agente` ou `agente/`) e insere a linha do widget nos HTML com `--inserir`.
4. **Avaliar** (`avaliar`): confere se cada pergunta acha a própria resposta e cada página é
   encontrada, e mostra o que errou.

Detalhes do formato: [docs/FORMATO-DA-BASE.md](docs/FORMATO-DA-BASE.md). Arquitetura e decisões:
[docs/COMO-FUNCIONA.md](docs/COMO-FUNCIONA.md).

## Comandos

| Comando | O que faz |
| --- | --- |
| `instalador [pasta]` | (0.9) Instalador visual numa janela: etapas com instruções, funcionalidades com checkbox, aparência, instalação, teste e etapa 2 (é o que o `agente-instalador` abre) |
| `desinstalar [pasta]` | (0.9) Desfaz a instalação: widget fora das páginas, pasta do agente apagada, base guardada. `--sim` confirma, `--tudo` apaga também `agente-gerador/` |
| `assistente [pasta]` | Guiado com perguntas sim/não, do raio X ao teste no navegador (é o que o executável roda). `--sim` aceita os padrões |
| `criar <pasta>` | Tudo de uma vez: analisar, gerar, instalar e avaliar |
| `analisar <pasta>` | Só o raio X (`agente-gerador/relatorio.json`) |
| `gerar <pasta>` | Base de conhecimento a partir do relatório (não sobrescreve sem `--forcar`) |
| `instalar <pasta>` | Núcleo e widget na pasta pública; `--inserir` liga nas páginas |
| `avaliar <pasta>` | Porcentagem de acerto, erros e assuntos que faltam (`--frases` com frases próprias, `--variacoes` com frases geradas, `--html` grava `agente-gerador/avaliacao.html`) |
| `conversar <pasta> [frases]` | Conversa no terminal (sem frases: modo interativo) |
| `prompt-ia <pasta>` | `agente-gerador/PROMPT-IA.md` para colar no ChatGPT, Gemini, Copilot, DeepSeek... |
| `aplicar-ia <pasta> <arquivo>` | Junta a resposta da IA à base, com conferência e backup |
| `gemini <pasta>` | Igual aos dois acima, automático, com `GEMINI_API_KEY` (plano gratuito) |
| `servir <pasta>` | Servidor local para sites HTML estáticos |
| `observar [pasta]` | Parte 1+: você usa o site por alguns minutos e o agente aprende (páginas reais, formulários, busca, login, catálogo da API, consulta de pedidos). `--url`, `--minutos` |
| `treinar [pasta]` | Parte 2: o site abre com o agente em modo treino; **Certo**/**Corrigir** em cada resposta, inclusive conversas em etapas. É o que o `agente-treinador` roda. Desde a 0.4, as frases não entendidas no site aparecem primeiro |
| `aprender [pasta]` | Agrupa as frases que o agente não entendeu (do servidor ou exportadas do navegador) e sugere onde encaixar; `--aplicar` pergunta grupo a grupo |
| `editar [pasta]` | Editor visual da base no navegador, com teste do rascunho, acerto e salvamento com backup |
| `setor [pasta]` | Setor detectado e ranking com as evidências; `--setor <id>` troca (também vale em `criar`, `gerar` e `site`) |
| `perfil [pasta]` | (0.8) Respostas com os dados de quem está logado: `--fonte /api/minha-conta` liga e lê a API do próprio site; `--ativar` (o site chama `agente.identificar`); `--desativar`; `--testar usuario.json`. Lista as galerias de fotos |
| `site <url> [pasta]` | Site já publicado: lê as páginas públicas e cria `agente-servico/` (serviço para publicar à parte, com IA opcional). `--max-paginas`, `--pausa`, `--navegador`, `--so-conteudo`, `--sim` |

Todos aceitam `--json` (saída para scripts e IAs). Também em inglês: `create`, `scan`, `generate`,
`install`, `eval`, `chat`, `ai-prompt`, `ai-apply`, `serve`.

## Para quem vai usar

- **Pessoas:** [TUTORIAL.md](TUTORIAL.md), passo a passo com o que esperar de cada comando.
- **IAs de código e de chat:** [GUIA-PARA-IA.md](GUIA-PARA-IA.md).

## Limites (de propósito)

- É um agente **simples**: responde com o que está na base (com conversas em etapas, consultas da
  conta, perfil da pessoa logada, fotos do site e memória da última lista). Sem IA, não conversa livremente (com IA, ela só traduz o
  pedido para a base), não lembra de conversas antigas e não
  faz compras ou cadastros pelo visitante; ele leva às páginas certas.
- O raio X lê o código, não o banco de dados. Catálogo em banco: aponte `catalogo.url` para a
  rota da API que lista os itens (o raio X sugere quando encontra uma).
- Português do Brasil.

Observar e treinar (0.3): [docs/OBSERVAR-E-TREINAR.md](docs/OBSERVAR-E-TREINAR.md).

Roadmap (0.7 em diante): [docs/ROADMAP.md](docs/ROADMAP.md), com as pesquisas em
[docs/PESQUISA-AGENTES.md](docs/PESQUISA-AGENTES.md) e
[docs/PESQUISA-MERCADO.md](docs/PESQUISA-MERCADO.md). Histórico das versões 0.3 a 0.6:
[docs/MELHORIAS.md](docs/MELHORIAS.md).
A visão de produto (chatbot local, fácil de configurar e IA limitada por capacidades aprovadas)
está em [docs/ROADMAP-PRODUTO.md](docs/ROADMAP-PRODUTO.md).

## Desenvolvimento

```bash
npm test            # node --test, sem dependências
npm run build:exe   # gera dist/agente-gerador-<sistema> para o sistema atual (Node 22.12+)
```

Sem dependências de produção. Licença MIT.
