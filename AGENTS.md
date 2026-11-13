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
  - Versão 0.5: extras do raio X em `src/scanner/extras.js` (sitemap, locales, metadata do Next, mensagens de erro); avaliação com `src/eval/variations.js`, `coverage.js` e `html.js`; login por token em `consultas.auth` (`src/agent/lookup.js` `readToken`/`lookupHeaders`; o gravador manda só o nome da chave).
  - Versão 0.4: entidades do catálogo e memória curta em `src/agent/entities.js` (usado por `agent.js`: `answerCatalog` com `base`/`force`/`reuse` e `followUp`); privacidade das frases não entendidas em `src/agent/privacy.js` (navegador e `templates/servidor.js`); agrupamento e sugestões em `src/learn/misses.js` (comando `aprender`); editor visual em `src/editor/` (servidor só 127.0.0.1 com código de sessão; cliente sem innerHTML). Detalhes: [docs/APRENDER-E-EDITAR.md](docs/APRENDER-E-EDITAR.md).
  - Observação e treino (0.3): `src/observe/` (proxy local `proxy.js`, registro sem dado pessoal `record.js`, aprendizado `learn.js`, sessão `session.js`; scripts de navegador em `src/observe/client/`, clássicos, só `textContent` e estilos via CSSOM) e `src/train/apply.js` (correções puras). O proxy só aceita destino `http://localhost` e nunca guarda cookie/token; o agente nunca executa POST/PUT/DELETE pelo visitante. Detalhes: [docs/OBSERVAR-E-TREINAR.md](docs/OBSERVAR-E-TREINAR.md).
  - Base com 7 arquivos (`KNOWLEDGE_FILES`): os dois novos, `fluxos` e `consultas`, são conferidos em `src/agent/knowledge.js`; o resumo das consultas fica em `src/agent/lookup.js` (núcleo, também no navegador).
  - Roadmap: [docs/MELHORIAS.md](docs/MELHORIAS.md).
