# Guia para IAs: como criar o agente de um projeto com o Agent Generator

Este arquivo é para **assistentes de IA**: IAs de código que executam comandos (GitHub Copilot,
Codex, Claude Code, Cursor, Windsurf...) e IAs de chat (ChatGPT, Gemini, Copilot, DeepSeek...).
Siga os passos na ordem. Pessoas: o guia de vocês é o [TUTORIAL.md](TUTORIAL.md).

## Regras

1. **Não invente fatos do negócio** (preço, prazo, endereço, telefone, política de troca,
   horário). Use só o que estiver no projeto ou o que a pessoa disser. Se faltar, pergunte.
2. **Não edite** `agente/nucleo/*` nem `agente/widget.*`: são copiados pelo `instalar`. Mudanças de
   conteúdo vão só em `agente/conhecimento/*.json`.
3. **Não apague** a base existente. `gerar`/`criar` sem `--forcar` mantém os arquivos editados; com
   `--forcar`, o backup vai para `agente-gerador/backup/`.
4. **Nunca** coloque chaves (ex.: `GEMINI_API_KEY`) em arquivos do projeto ou em commits.
5. Use `--json` para ler os resultados e confirme cada passo antes do próximo.

## A. IA de código (executa comandos no repositório)

Variáveis: `AG` = pasta deste repositório; `PROJ` = pasta do projeto da pessoa.

```bash
# 0. Requisitos
node -v                                   # precisa ser >= 20
# 1. Criar tudo (raio X, base, instalação, avaliação). --inserir liga o widget nos HTML de entrada.
node $AG/bin/agent-generator.js criar $PROJ --inserir --json
# (alternativa: o fluxo do executável sem perguntas, que também guarda cópia dos HTML alterados
#  em agente-gerador/backup/html e escreve agente-gerador/RESUMO.txt)
# node $AG/bin/agent-generator.js assistente $PROJ --sim --sem-pausa --json
```

Leia do JSON: `relatorio` (quantas páginas/FAQ/itens), `destino`, `snippet`, `inserido.changed`,
`geral` (acerto %) e `avisos`.

2. **Ligar o widget, se `inserido.changed` vier vazio** (React com JSX, Next.js, templates de
   servidor): coloque as duas linhas do `snippet` no layout comum a todas as páginas, antes de
   `</body>`. Next.js (App Router): em `app/layout.(js|tsx)`, use
   `<Script type="module" src="/agente/widget.js" strategy="afterInteractive" />` e um `<link>` para
   `/agente/widget.css`.
3. **Tratar os avisos:**
   - "Nenhuma pergunta frequente": leia README, páginas de ajuda/termos e escreva perguntas reais em
     `faq.json` (formato em [docs/FORMATO-DA-BASE.md](docs/FORMATO-DA-BASE.md)).
   - "Sem catálogo... rota X": confirme que `GET X` devolve uma lista (array, ou `{ data: [...] }`).
     Se sim, mantenha `catalogo.url`; ajuste `catalogo.campos` se os nomes dos campos forem incomuns
     (`{"nome": "title", "preco": "valor"}`) e `catalogo.linkModelo` (ex.: `/produto/{id}`).
   - "Sem contato encontrado": peça à pessoa e edite `intencoes.json > contato > respostas`.
4. **Enriquecer a base** (você mesmo é a IA, sem chave):
   ```bash
   node $AG/bin/agent-generator.js prompt-ia $PROJ --json   # gera agente-gerador/PROMPT-IA.md
   ```
   Leia o `PROMPT-IA.md`, produza o JSON pedido seguindo as regras dele, salve em
   `agente-gerador/resposta-ia.json` e aplique:
   ```bash
   node $AG/bin/agent-generator.js aplicar-ia $PROJ $PROJ/agente-gerador/resposta-ia.json --json
   ```
   Confira em `changes` o que entrou e em `changes.ignorados`/`problems` o que foi recusado.
5. **Validar:**
   ```bash
   node $AG/bin/agent-generator.js avaliar $PROJ --json
   node $AG/bin/agent-generator.js conversar $PROJ "oi" "<pergunta real do site>" "<produto> até 100 reais" --json
   ```
   Meta: `geral` >= 90. Para cada erro em `faq.erros`/`paginas.erros`, acrescente `termos` (sinônimos)
   ou exemplos e rode `avaliar` de novo. Opcional: crie `agente-gerador/frases.json` com
   `[{"frase": "...", "espera": "faq:<id>" | "pagina:<id>" | "<intencao>" | "catalogo"}]` e use
   `--frases agente-gerador/frases.json`.
6. **Testar no navegador**, se puder: suba o site (`npm run dev` do projeto ou
   `node $AG/bin/agent-generator.js servir $PROJ` para HTML estático), clique em "Ajuda" e faça 3
   perguntas. O console não deve mostrar erros.
6b. **Observar e treinar (opcional, precisa de navegador e de uma pessoa):** com o site rodando,
   `node $AG/bin/agent-generator.js observar $PROJ --url http://localhost:PORTA` e peça para a pessoa
   navegar, buscar, entrar na conta e clicar em **Concluir**; depois `treinar` para ela corrigir as
   respostas no próprio site. Sem pessoa disponível, pule (ou escreva `fluxos.json` e
   `consultas.json` à mão pelo [formato](docs/FORMATO-DA-BASE.md)).
7. **Entregar:** um commit (ou PR) com `agente/` (ou `public/agente/`), as linhas do widget e,
   se a pessoa quiser, `agente-gerador/relatorio.json` e `avaliacao.txt`. Explique à pessoa onde
   editar os textos (`agente/conhecimento/`).

**Repositório remoto sem terminal** (só leitura/escrita de arquivos): não dá para rodar o
comando. Clone e rode localmente, ou monte os arquivos de `conhecimento/` (5 obrigatórios; `fluxos` e `consultas` opcionais) à mão pelo formato,
copie `src/agent/*.js` para `agente/nucleo/`, `widget/widget.*` para `agente/` e adicione as duas
linhas do widget.

## B. IA de chat (não executa comandos)

A pessoa vai colar aqui o conteúdo de `agente-gerador/PROMPT-IA.md` (gerado pelo comando
`prompt-ia`). Responda **somente** com o bloco JSON no formato pedido, seguindo as regras do
próprio prompt. Depois, diga à pessoa:

1. Salvar sua resposta num arquivo, ex.: `resposta.json` (só o JSON).
2. Rodar `node bin/agent-generator.js aplicar-ia <pasta-do-projeto> resposta.json`.
3. Rodar `node bin/agent-generator.js avaliar <pasta-do-projeto>` e conferir as perguntas novas em
   `agente/conhecimento/faq.json`.

Se a pessoa não tiver o prompt, peça que rode primeiro:
`node bin/agent-generator.js criar <pasta-do-projeto>` e depois `prompt-ia`.

## Versão 0.4: aprender e editar

- `agent-generator aprender <pasta> --json`: grupos de frases não entendidas com sugestão
  (`intencao`, `faq`, `pagina`, `nova`). `--aplicar --sim` aplica só o seguro (confiança ≥ 0,8).
- `agent-generator editar <pasta> --sem-navegador`: imprime o endereço do editor (com código de
  sessão). Não use em servidor público: é uma ferramenta local.
- O agente já entende cor/marca/tamanho do catálogo e "e em azul?", "o mais barato", "compara os
  dois"; não é preciso criar intenções para isso.

## Versão 0.6: site já publicado (sem o código)

```bash
# Lê as páginas públicas e cria a pasta com o serviço (use só em sites do usuário; --sim confirma).
node $AG/bin/agent-generator.js site https://site-do-usuario.com.br ./agente-site --sim --json
# Testar o serviço gerado
cd ./agente-site/agente-servico && ORIGENS=https://site-do-usuario.com.br node servico.js
# Atualizar só páginas e catálogo, mantendo as edições da base
node $AG/bin/agent-generator.js site https://site-do-usuario.com.br ./agente-site --sim --so-conteudo
```

- Passe ao usuário as duas linhas do widget (o JSON traz `snippet`) e, se `csp` vier `true`, o
  aviso de Content-Security-Policy que está em `avisos`.
- IA opcional só no serviço, por variáveis (`IA_PROVEDOR`, `IA_CHAVE`, `IA_MODELO`, `IA_URL`);
  nunca grave chaves em arquivos. Detalhes: [docs/SITE-PUBLICADO.md](docs/SITE-PUBLICADO.md).
