# Aprender com o uso e editar a base (versão 0.4)

## 1. O agente conversa sobre o catálogo

Sem escrever nada a mais, o agente entende **categoria, cor, marca, tamanho e preço** do seu
catálogo e lembra a última lista mostrada:

| Visitante | Agente |
| --- | --- |
| "tem tênis preto da Nike até 300?" | filtra pelas quatro coisas de uma vez |
| "e em azul?" / "e da Adidas?" | refaz a busca trocando só a cor ou a marca |
| "tem em vermelho?" (nenhum item vermelho) | "Não encontrei... Tenho em: preto, branco." |
| "o mais barato" | o mais barato com os mesmos filtros (sem o teto anterior) |
| "compara os dois" | preço, categoria e o que cada um tem a mais |
| "me fala do segundo" | detalhes e link do segundo item da lista |

## 2. Frases que o agente não entendeu

Quando o agente não entende (ou só dá um palpite fraco), a frase é guardada **sem dado pessoal**
(e-mail, telefone, CPF/CNPJ, códigos e números longos viram marcadores):

- **Modo navegador** (padrão): fica no navegador da pessoa (até 100 frases, 90 dias). No console:
  `agente.faltas()` lista e `agente.exportarFaltas()` baixa `faltas.json`.
- **Com registro no servidor**: em `conhecimento/agente.json`, `"registro": "/api/agente"` e, no seu
  back-end Node, `app.post("/api/agente", express.json(), await createChatHandler())` (arquivo
  `agente/servidor.js`). As frases vão para `agente/faltas.jsonl`.
- **Modo servidor** (`"endpoint": "/api/agente"`): o próprio servidor registra.

### Comando `aprender`

```bash
agent-generator aprender ./meu-site              # relatório em agente-gerador/APRENDER.txt
agent-generator aprender ./meu-site --aplicar    # pergunta grupo a grupo
agent-generator aprender ./meu-site --arquivo faltas.json   # arquivo exportado do navegador
```

As frases parecidas viram um grupo ("abre no feriado?", "vocês abrem no feriado") e cada grupo
recebe uma sugestão: virar exemplo de uma intenção, levar a uma pergunta frequente que já existe,
levar a uma página ou virar pergunta nova (aí você escreve a resposta). Com `--aplicar --sim`
(sem perguntas), só entram as sugestões com confiança alta; resposta nova nunca é inventada.
A base anterior vai para `agente-gerador/backup`.

No **treino** (`agent-generator treinar` ou o `agente-treinador`), as frases não entendidas
aparecem num quadro no canto da tela: toque numa, veja a resposta e use **Corrigir**.

## 3. Editor visual

```bash
agent-generator editar ./meu-site
```

Abre `http://127.0.0.1:4720/?t=<código>` com abas **Perguntas frequentes**, **Intenções**,
**Páginas**, **Conversas em etapas** e **Agente** (nome, saudação, cor, registro). Ao lado:

- **Testar o rascunho**: o agente responde com o que está na tela, antes de salvar;
- **Avaliar**: porcentagem de acerto e as frases que erraram;
- **Salvar**: grava os JSON (a versão anterior fica no backup, uma vez por sessão).

Segurança: só responde em 127.0.0.1, exige o código da sessão (que está na URL do terminal) e
recusa pedidos de outra origem ou de outro nome de host. Nada do que está na base vira HTML.

Pelo executável: rode no terminal `agente-gerador-windows.exe editar` (ou `aprender`) na pasta do
site; o duplo clique continua abrindo o assistente.
