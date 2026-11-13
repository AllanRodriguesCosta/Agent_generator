# Instruções para agentes de IA neste repositório

- **Para criar o agente de um projeto (usar a ferramenta):** siga [GUIA-PARA-IA.md](GUIA-PARA-IA.md).
- **Para mudar a ferramenta (este código):**
  - Node >= 20, ES modules, **sem dependências** (nem de desenvolvimento). Testes: `npm test` (`node --test`).
  - `src/agent/` é o núcleo que roda **no navegador e no Node**: não use `node:*` nem APIs de DOM ali.
  - `widget/` usa só DOM e `textContent` (nada de `innerHTML` com dados) e precisa funcionar com CSP sem `unsafe-inline`.
  - `src/scanner/` só lê arquivos: nunca grava no projeto analisado e nunca lê `.env` ou chaves.
  - O gerador não pode inventar fatos do negócio: só textos genéricos com o nome do site e o que o raio X achou.
  - Toda mudança de comportamento vem com teste em `tests/`. Rode `npm test` antes de abrir PR.
  - Textos para o usuário em português do Brasil.
  - Executável: `sea/launcher.cjs` (entrada CommonJS do Node SEA; extrai o pacote para o cache e chama `main` do CLI), `scripts/build-exe.js` (`npm run build:exe`), fluxo guiado em `src/cli/assistente.js`. Tudo o que o CLI precisa em tempo de execução tem de estar em `bin/`, `src/`, `widget/` ou `templates/` (lista `INCLUDE`). Detalhes: [docs/EXECUTAVEL.md](docs/EXECUTAVEL.md).
  - Roadmap: [docs/MELHORIAS.md](docs/MELHORIAS.md).
