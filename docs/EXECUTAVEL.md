# Executável: coloque na pasta do site e dê dois cliques

O executável faz o processo inteiro (raio X → base de conhecimento → instalação → widget nas
páginas → avaliação → teste no navegador) **sem precisar instalar Node, Git ou qualquer outra
coisa**. Ele leva o Node e o agent-generator dentro de um único arquivo.

## Baixar

Na página **Releases** do repositório (lado direito do GitHub), baixe o arquivo do seu sistema:

| Sistema | Parte 1 (cria o agente) | Parte 2 (treina o agente) |
| --- | --- | --- |
| Windows 10/11 (64 bits) | `agente-gerador-windows.exe` | `agente-treinador-windows.exe` |
| Linux (64 bits) | `agente-gerador-linux` | `agente-treinador-linux` |
| macOS (Apple Silicon: M1, M2, M3...) | `agente-gerador-macos` | `agente-treinador-macos` |

Cada arquivo tem de 80 a 120 MB, porque leva o Node dentro.

## Usar

1. Copie o executável para a **pasta raiz do seu site**, a que tem o `index.html` ou o `package.json`.
2. Dê dois cliques.
   - **Windows:** na primeira vez pode aparecer "O Windows protegeu o computador", porque o arquivo
     não tem assinatura paga. Clique em **Mais informações** e depois em **Executar assim mesmo**.
   - **macOS:** clique com o botão direito no arquivo, escolha **Abrir** e confirme. Se ele não
     abrir, rode no Terminal: `chmod +x agente-gerador-macos && ./agente-gerador-macos`.
   - **Linux:** `chmod +x agente-gerador-linux && ./agente-gerador-linux`.
3. Responda às perguntas. **Enter** aceita a opção em maiúscula (`[S/n]` = sim, `[s/N]` = não):

```
1/5  Fazendo o raio X do projeto (só leitura)...
     5 páginas, 3 rotas, 1 formulários, 5 perguntas frequentes, 7 itens de catálogo.
2/5  O agente vai ficar em: agente/
     Criar/atualizar o agente agora? [S/n]
3/5  Inserir a linha do widget em 5 página(s)? Uma cópia de cada vai para agente-gerador/backup/html. [S/n]
4/5  Acerto: 100%
5/5  Abrir o site no navegador agora, com o agente? [S/n]
```

Depois do passo 4, ele pergunta se você quer **mostrar o site funcionando por alguns minutos**:
o navegador abre num endereço local e o agente aprende com o que você usar (páginas, busca,
formulários e, se você entrar na sua conta, a consulta de pedidos). Termine no botão **Concluir**.

**Parte 2:** com o agente já no site, dê dois cliques no `agente-treinador`. O site abre com o
agente em modo treino: converse com ele e use **Certo**/**Corrigir** em cada resposta. Tudo em
[OBSERVAR-E-TREINAR.md](OBSERVAR-E-TREINAR.md).

No final fica um resumo em `agente-gerador/RESUMO.txt`, com tudo o que foi feito e os próximos
passos.

## O que ele altera no seu projeto

| O quê | Onde | Pode desfazer? |
| --- | --- | --- |
| Arquivos do agente | `agente/` (ou `public/agente/`, `static/agente/`...) | Sim, é só apagar a pasta. |
| Relatórios e backups | `agente-gerador/` | Sim, é só apagar a pasta. |
| Linha do widget nos HTML (só se você disser sim) | `index.html` e páginas da raiz | Sim: as versões originais ficam em `agente-gerador/backup/html/`. |

Ele nunca lê `.env`, chaves ou senhas, e não envia nada para a internet. A única exceção é o
Gemini, que só é oferecido se você tiver configurado `GEMINI_API_KEY`.

**React, Next.js, Vue, Angular e outros frameworks:** o executável instala o agente, mas não mexe
no código-fonte. A linha a colar no layout fica em `agente-gerador/COMO-LIGAR.txt`.

## Rodar de novo

Rode de novo quando o site mudar. Se a base já existe, ele pergunta se você quer **regerar do
zero**:

- **Não (padrão):** mantém o que você editou à mão.
- **Sim:** a base atual vai para `agente-gerador/backup/` antes de ser regerada.

A linha do widget nunca é inserida duas vezes.

## Outros jeitos de chamar

- **Arrastar uma pasta** sobre o executável: roda o assistente naquela pasta.
- **No terminal**, ele aceita os mesmos comandos do CLI:
  ```bash
  agente-gerador-windows.exe conversar . "oi" "qual o horário?"
  agente-gerador-windows.exe avaliar .
  agente-gerador-windows.exe aplicar-ia . resposta.json
  agente-gerador-windows.exe ajuda
  ```
- **Sem perguntas** (para scripts e IAs de código): `agente-gerador --sim --sem-pausa`. Ele aceita
  todos os padrões e não abre o navegador.

## Sem baixar o executável (quem já tem Node e Git)

Copie para a raiz do site o lançador da pasta [`lancadores/`](../lancadores) e dê dois cliques:

- **Windows:** `agente-gerador.cmd`.
- **Linux e Mac:** `agente-gerador.sh`, que roda com `sh agente-gerador.sh`.

O lançador baixa a versão mais nova do GitHub e roda o mesmo assistente. Ele tem poucos bytes,
contra os 100 MB do executável.

## Para quem mantém o repositório

- O código do executável tem três partes:
  - `sea/launcher.cjs`: o ponto de entrada;
  - `scripts/build-exe.js`: o empacotamento;
  - `src/cli/assistente.js`: o fluxo de perguntas.
- Para gerar o executável na sua máquina: `npm run build:exe`. Ele precisa de Node 22.12 ou mais
  novo, de preferência o 24, e de internet na primeira vez, para baixar o `postject` pelo `npx`.
  O resultado sai em `dist/` (`agente-gerador-windows.exe`, `-linux` ou `-macos`), que fica fora do
  git. Não renomeie para só `agente-gerador`: esse nome é o da pasta de trabalho que ele cria.
- Como o executável funciona por dentro:
  1. O Node "single executable application" leva um recurso `pacote.json` com os arquivos de
     `bin/`, `src/`, `widget/` e `templates/`.
  2. Na primeira execução, esses arquivos são extraídos para a pasta de cache do usuário:
     - Windows: `%LOCALAPPDATA%\agent-generator`;
     - Linux: `~/.cache/agent-generator`;
     - macOS: `~/Library/Caches/agent-generator`.
  3. A extração acontece uma vez por versão.
- O CI (job `executavel`) gera o executável no Windows, no Linux e no macOS a cada PR e roda o
  arquivo dentro de uma cópia do site de exemplo, numa pasta com espaço no nome.
- **Publicar uma versão:** crie a tag `vX.Y.Z` ou abra Actions > "Publicar executáveis" > Run
  workflow. A Release fica com os 3 executáveis e os 2 lançadores.
