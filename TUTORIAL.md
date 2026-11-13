# Tutorial: um agente para o seu site em 10 minutos

Este guia é para quem não quer programar. Você vai rodar alguns comandos, conferir o resultado e
ajustar textos em arquivos simples.

> **Sem instalar nada:** baixe o executável na página Releases, coloque na pasta raiz do seu site
> e dê dois cliques. Ele faz os passos 2 e 3 deste tutorial sozinho, perguntando sim/não. Veja
> [docs/EXECUTAVEL.md](docs/EXECUTAVEL.md). O resto do tutorial (ajustar a base, IA, publicar)
> vale igual.

## 1. O que você precisa

- **Node.js 20 ou mais novo** ([nodejs.org](https://nodejs.org), versão LTS). Para conferir, abra o
  terminal (no Windows: PowerShell) e digite `node -v`.
- **A pasta do seu projeto** no computador (a que tem o `index.html`, ou o `package.json` se for
  React/Next/Vue...).
- **Este repositório** baixado: botão verde "Code" > "Download ZIP" (e descompacte), ou
  `git clone https://github.com/AllanRodriguesCosta/Agent_generator.git`.

## 2. Criar o agente

No terminal, entre na pasta do Agent Generator e rode, trocando o caminho pelo do seu projeto:

```bash
cd Agent_generator
node bin/agent-generator.js criar "C:\Users\voce\projetos\meu-site" --inserir
```

O resultado é parecido com:

```
Raio X de "Café Aurora" (Express): 5 páginas, 3 rotas, 1 formulários, 5 perguntas frequentes, 7 itens de catálogo.
Agente instalado em .../meu-site/agente (site estático: a pasta agente/ fica ao lado do index.html).
Base de conhecimento criada em .../meu-site/agente/conhecimento.
Acerto da base: 100% (detalhes em agente-gerador/avaliacao.txt).
Linha do widget inserida em: index.html, cardapio.html, contato.html, ...
```

O que apareceu no seu projeto:

| Pasta | Para quê |
| --- | --- |
| `agente/` (ou `public/agente/`) | O agente em si, publicado com o site |
| `agente/conhecimento/` | **O que você edita**: textos, perguntas, páginas, produtos |
| `agente-gerador/` | Relatório do raio X, avaliação, prompt para IA e backups (não vai para o site) |

> Sem `--inserir`, o comando mostra as duas linhas para colar antes do `</body>` de cada página.
> Em React/Vite elas vão no `index.html`; em Next.js, no `app/layout`.

## 3. Testar

No terminal:

```bash
node bin/agent-generator.js conversar "C:\...\meu-site"
```

Escreva como um visitante ("oi", "vocês entregam no sábado?", "quero um café até 50 reais") e
veja as respostas. `sair` termina.

No navegador: abra o site como você já faz (por exemplo `npm run dev`). Para um site só com HTML:

```bash
node bin/agent-generator.js servir "C:\...\meu-site"
```

e abra http://localhost:5173. O botão **Ajuda** aparece no canto inferior direito.

## 4. Ajustar a base

Abra os arquivos de `agente/conhecimento/` no VS Code ou no Bloco de Notas:

- **agente.json:** nome do assistente, `cor` (ex.: `"#e11d48"`), `saudacao`, `posicao`
  (`"direita"` ou `"esquerda"`) e `sugestoes` (botões iniciais).
- **faq.json:** perguntas e respostas. Em `termos`, ponha sinônimos ("pix boleto cartão").
- **intencoes.json:** frases de exemplo e respostas para cumprimento, contato, ajuda... Quanto mais
  exemplos diferentes, melhor o agente entende.
- **paginas.json:** páginas e os `termos` que levam a cada uma.
- **catalogo.json:** produtos ou serviços (`nome`, `preco`, `categoria`, `link`, `imagem`). Se
  eles vêm de uma API do site, use `"url": "/api/produtos"` e `"linkModelo": "/produto.html?id={id}"`.

Depois de editar, confira:

```bash
node bin/agent-generator.js avaliar "C:\...\meu-site"
```

> Rodar `criar` ou `gerar` de novo **não apaga** o que você editou. Para recomeçar do zero use
> `--forcar`: a base antiga fica salva em `agente-gerador/backup/`.

## 5. Melhorar com IA (opcional e gratuito)

**Com qualquer IA de chat** (ChatGPT, Gemini, Copilot, DeepSeek...):

1. `node bin/agent-generator.js prompt-ia "C:\...\meu-site"`
2. Abra `agente-gerador/PROMPT-IA.md`, copie tudo e cole no chat.
3. Copie a resposta (o bloco JSON) para um arquivo, ex.: `resposta.json`.
4. `node bin/agent-generator.js aplicar-ia "C:\...\meu-site" resposta.json`

**Automático com o Gemini:** crie uma chave grátis em https://aistudio.google.com e rode:

```bash
# Windows PowerShell:  $env:GEMINI_API_KEY="sua-chave"
# Mac/Linux:           export GEMINI_API_KEY="sua-chave"
node bin/agent-generator.js gemini "C:\...\meu-site"
```

A IA só **acrescenta** frases, perguntas e sinônimos, e tudo é conferido antes (links que não
existem e HTML são removidos). Mesmo assim, **leia as respostas novas em `faq.json`**: a IA pode
errar fatos.

## 6. Publicar

A pasta `agente/` (ou `public/agente/`) vai junto com o site, no mesmo deploy de sempre (Render,
Vercel, Netlify, GitHub Pages...). Não precisa de servidor extra nem de chave.

## Problemas comuns

| Sintoma | O que fazer |
| --- | --- |
| O botão não aparece | Confira as duas linhas no HTML e se `/agente/widget.js` abre no navegador. Abrir o `index.html` com dois cliques (endereço `file://`) não funciona: use `servir` ou o servidor do seu projeto. |
| "Nenhuma página encontrada" | Você apontou para a pasta certa? Ela deve conter o site, não a pasta acima dele. |
| Responde errado | Acrescente exemplos em `intencoes.json` ou `termos` em `faq.json`/`paginas.json` e rode `avaliar`. |
| Produtos não aparecem | Sem lista em JSON/CSV no projeto, configure `catalogo.url` (rota da API). |
