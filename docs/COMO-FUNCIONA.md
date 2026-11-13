# Como funciona por dentro

## Peças

| Pasta | Papel | Roda em |
| --- | --- | --- |
| `src/scanner/` | Raio X: lista arquivos (sem `node_modules`, builds, `.env`, chaves), lê HTML/JSX/Vue/Markdown/JSON/CSV/rotas | Node |
| `src/generator/` | Relatório → base (`index.js`); prompt, conferência e junção da resposta de IA, e Gemini (`ai.js`) | Node |
| `src/agent/` | Núcleo do agente: texto, classificador, busca, conferência da base, mapeamento de catálogo | Navegador e Node |
| `widget/` | Botão + painel de conversa (DOM puro, acessível, sem `innerHTML` com dados) | Navegador |
| `src/installer/` | Copia núcleo e widget, escreve a base, insere as tags nos HTML | Node |
| `src/eval/` | Avaliação da base | Node |
| `bin/agent-generator.js` | Linha de comando | Node |

## Como o agente decide a resposta

1. **Pré-processamento** (`text.js`): minúsculas, sem acento, vogais alongadas reduzidas ("oiii"),
   palavras vazias removidas e radicais leves no estilo RSLP ("entregam" → "entreg").
2. **Intenção** (`classifier.js`): Naive Bayes multinomial com radicais e pares de palavras, treinado
   ao carregar a página (milissegundos) com os exemplos de `intencoes.json`. Palavra desconhecida
   vira a mais parecida do vocabulário (distância de edição).
3. **Busca** (`search.js`): pontuação por palavras em comum, com peso maior para as raras (IDF), em
   três níveis (título/pergunta, termos, texto), com tolerância a erro de digitação e prefixo.
4. **Decisão** (`agent.js`), nesta ordem:
   - "mais opções" continua a última lista do catálogo;
   - frase curta e confiante ("oi", "obrigado") → intenção;
   - pedido de compra ("quero um café", "até R$ 50") → catálogo, filtrado pelo preço;
   - pergunta com boa correspondência → FAQ ou página (a FAQ ganha da página genérica; se a
     intenção leva à mesma página, como Contato, a intenção responde porque traz mais dados);
   - intenção confiante → resposta da intenção;
   - correspondência fraca → "Talvez isto ajude: ..." com sugestões;
   - senão → "não entendi", sugestões e os botões de contato.
5. **Contexto**: o widget guarda só o necessário para "mais opções" e para alternar respostas; o
   histórico fica no `sessionStorage` da aba.

## Por que não usar um modelo de linguagem para responder

Custo zero, funciona sem internet e sem chave, responde em milissegundos e **não inventa**: tudo o
que ele diz está na base, que a pessoa pode ler e corrigir. A IA entra só na hora de *escrever* a
base, e o que ela sugere passa por conferência.

## Segurança

- O raio X nunca lê `.env`, `*.pem`, `*.key`, arquivos com "secret"/"credentials" no nome, nem
  grava no projeto (quem grava é o `gerar`/`instalar`, só em `agente/` e `agente-gerador/`).
- O widget monta tudo com `textContent`; links só `http(s)` ou do próprio site; links externos
  abrem em nova aba com `noopener`.
- A chave do Gemini vem do ambiente, vai no cabeçalho (nunca na URL) e não é gravada.
