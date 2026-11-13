# Observar e treinar: o agente aprende com você usando o site

Versão 0.3. Duas etapas que tiram quase todo o trabalho manual de melhorar o agente:

| Parte | Executável | Comando | O que você faz | O que o agente aprende |
| --- | --- | --- | --- | --- |
| 1 | `agente-gerador-*` | `assistente` (passo 4b) ou `observar` | Usa o site por alguns minutos, como um cliente | Páginas reais (inclusive de React/Vue), formulários usados, busca do site, página de login, catálogo vindo da API e consultas da conta (pedidos, agendamentos...) |
| 2 | `agente-treinador-*` | `treinar` | Conversa com o agente dentro do site e marca **Certo** ou **Corrigir** em cada resposta | Frases novas, respostas novas, textos corrigidos e **conversas em etapas** (o agente pergunta antes de responder) |

Os dois executáveis são o mesmo programa: o nome do arquivo decide o que abre. Coloque na pasta
raiz do site e dê dois cliques.

## Como funciona por dentro

O Agent Generator sobe um **proxy local** (`http://localhost:4700` na observação, `4710` no treino)
na frente do seu site e abre o navegador nele. O proxy:

- repassa tudo para o site de verdade (que continua igual: nenhum arquivo do projeto é alterado
  durante a sessão);
- injeta nas páginas HTML um gravador (`/__agente-gerador/gravador.js`) com o aviso
  "Agent Generator: observando o site" e o botão **Concluir**;
- anota as chamadas de API: método, caminho (com `:id` no lugar de números e códigos), parâmetros
  de busca, status e uma amostra da resposta.

Onde está o site? Nesta ordem: `--url`, endereço da última vez, site HTML estático (servido pelo
próprio Agent Generator), um site já aberto numa porta comum (3000, 5173, 8080...) ou, com a sua
permissão, `npm run dev`/`start` do `package.json`. Se nada der certo, ele pergunta o endereço.

A sessão termina no botão **Concluir**, com **Enter** no terminal, com Ctrl+C ou no tempo
(`--minutos`, padrão 5 na observação e 30 no treino).

## Privacidade e segurança

- Só aceita site rodando na sua máquina (`http://localhost`). Escuta só em `127.0.0.1`.
- Nunca guarda cookie, token, senha, e-mail, telefone, CPF/CNPJ, cartão nem endereço: chaves com
  esses nomes viram `[oculto]`, e valores com cara de dado pessoal também.
- Dos formulários, guarda só os **rótulos** dos campos e o texto do botão, nunca o que foi digitado.
- Ações que mudam dados (POST, PUT, DELETE, como "adicionar ao carrinho" ou "finalizar compra")
  aparecem só no relatório. **O agente não executa ações pelo visitante**; ele explica e leva à
  página. Executar compras ou cadastros sem a pessoa clicar seria arriscado (CSRF, cobrança errada,
  pedido duplicado). Se o seu site quiser isso, o caminho é o site expor um evento próprio (veja
  B5 em [MELHORIAS.md](MELHORIAS.md)).

## Parte 1: observar

```bash
agent-generator observar ./meu-site            # site estático ou detectado
agent-generator observar ./meu-site --url http://localhost:3000 --minutos 10
```

Dicas para render mais:

1. Navegue por **todas as seções** (o raio X do código não vê páginas montadas em JavaScript).
2. Faça uma **busca** no site: o agente passa a responder "procurar X" com o link pronto.
3. **Entre na sua conta** e abra "Meus pedidos" (ou agendamentos, reservas): o agente aprende a
   consultar a conta de quem estiver logado.
4. Envie os formulários principais (cadastro, contato, agendamento): viram perguntas do tipo
   "Como faço para criar minha conta?" com os campos reais.

Saída: a base em `agente/conhecimento/` é atualizada (cópia anterior em `agente-gerador/backup/`),
mais `agente-gerador/OBSERVACAO.txt` (o que foi aprendido, caminhos mais usados e ações vistas) e
`agente-gerador/observacao.json` (dados brutos, já sem informação pessoal).

## Parte 2: treinar

```bash
agent-generator treinar ./meu-site
```

O site abre com o agente em **modo treino** (o widget é colocado pelo proxy, mesmo em páginas que
ainda não têm a linha do widget). Embaixo de cada resposta:

- **Certo**: fica anotado.
- **Corrigir** abre quatro opções:
  1. *Usar uma resposta que já existe na base*: a frase vira exemplo daquela intenção, pergunta ou
     conversa.
  2. *Corrigir o texto desta resposta* (quando veio da FAQ).
  3. *Responder com um texto novo*: vira pergunta nova na FAQ (com link opcional).
  4. *Fazer uma pergunta antes de responder*: cria uma **conversa em etapas**, por exemplo
     "quero encomendar um bolo" → "Para quantas pessoas?" → "Até 10" / "Mais de 10", cada opção
     com a sua resposta.

Cada correção é salva na hora (backup antes da primeira), a base é conferida e o widget recarrega:
dá para perguntar de novo e ver a resposta nova. No fim ficam `agente-gerador/TREINO.txt`
(o que mudou e o acerto antes/depois) e `agente-gerador/treino-log.json`. O gravador continua
ligado durante o treino, então o que você navegar também é aprendido.

## O que o agente passa a fazer

| Antes (0.2) | Depois de observar e treinar (0.3) |
| --- | --- |
| Responde por FAQ, páginas e catálogo do código | Também conhece as páginas montadas em JavaScript e os formulários de verdade |
| "Procurar X" só no catálogo que ele tem | Monta o link da busca do site (`/busca?q=X`) |
| "Onde está meu pedido?" → manda para a página | Lê a lista de pedidos da API do site **com a sessão de quem está logado** e responde "Pedido mais recente (#A1B2C3D4), de 10/11/2026: “Enviado”"; sem login, oferece o botão Entrar |
| Uma pergunta, uma resposta | Conversa em etapas, com encadeamento (uma opção pode levar a outra pergunta) |
| Melhorar = editar JSON | Melhorar = conversar e clicar em Corrigir |

Formato dos arquivos novos (`fluxos.json` e `consultas.json`): [FORMATO-DA-BASE.md](FORMATO-DA-BASE.md).

## Limites

- A consulta da conta usa a sessão por **cookie** do próprio site (mesmo domínio). Desde a 0.5,
  sites que guardam o login em `localStorage`/`sessionStorage` e mandam `Authorization: Bearer`
  também funcionam: a observação descobre o nome da chave (nunca o valor) e grava
  `consultas.auth`.
- O proxy não repassa WebSocket (recarregamento automático de alguns `npm run dev` pode não
  funcionar dentro da sessão; o site funciona normalmente).
- Sites com Content-Security-Policy por *nonce* podem bloquear os scripts injetados. Nesse caso, use
  a observação com o site em modo de desenvolvimento.
