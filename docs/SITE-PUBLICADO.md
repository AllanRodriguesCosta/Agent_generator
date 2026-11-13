# Site já publicado: agente sem o código (versão 0.6)

Para quando o site já está no ar (hospedado em qualquer lugar) e você não tem, ou não quer
mexer, no código. O site **não sai do ar** em nenhum momento.

```bash
npx github:AllanRodriguesCosta/Agent_generator site https://minhaloja.com.br
# ou, com o repositório baixado:
node bin/agent-generator.js site https://minhaloja.com.br ./agente-minhaloja
```

## O que acontece

1. **Leitura das páginas públicas** (`src/crawler/`): `robots.txt` (regras e `Crawl-delay`),
   `sitemap.xml` e links da própria página, com pausa entre páginas e identificação
   (`agent-generator/0.6`). Nunca entra em conta, login, carrinho, checkout, pedidos ou
   administração, e nunca envia formulários.
2. **Catálogo**: produtos marcados com schema.org (`Product` em JSON-LD, como o Google pede),
   listas públicas de plataformas (Shopify `products.json`, WooCommerce Store API) e APIs comuns
   (`/api/products`, `/api/produtos`...) quando o `robots.txt` permite. Páginas de produto têm cota
   própria (até 400), para o catálogo inteiro caber.
3. **Espelho**: as páginas lidas viram arquivos `.html` na pasta de saída e o raio X normal roda
   sobre elas. Os links da base voltam a ser os do site (`/sobre`, `/faq#prazo`).
4. **Serviço pronto** (`agente-servico/`): servidor Node 20 sem dependências (`servico.js`) que
   entrega o widget e a base e responde a conversa. Com CORS só para o seu site (`ORIGENS`),
   limite por IP, `/saude` e catálogo vivo (relê a API pública a cada 30 min).
5. **Pasta pronta para virar repositório**: `render.yaml` (Render gratuito, `rootDir`
   `agente-servico`), `Dockerfile`, `.env.exemplo`, `LEIA-ME.md` e a Action
   `.github/workflows/atualizar-agente.yml`, que relê o site toda semana com `--so-conteudo`.

No site, só duas linhas antes de `</body>` (o próprio serviço mostra em `/`):

```html
<link rel="stylesheet" href="https://SEU-SERVICO/agente/widget.css">
<script type="module" src="https://SEU-SERVICO/agente/widget.js"></script>
```

Se o site usa **Content-Security-Policy**, o comando avisa o que acrescentar
(`script-src`, `style-src`, `connect-src` com o endereço do serviço). Testado na Violet Voltage:
sem isso o navegador bloqueia o widget; com isso, funciona.

## IA opcional: "a IA entende, o agente decide" (`src/agent/ia.js`)

O agente responde sozinho. Só o que ele **não entendeu** vai à IA, que **reescreve** o pedido
numa frase simples do vocabulário da base ("cadê o que comprei semana passada" → "como acompanho
meu pedido?"). Quem responde continua sendo a base: páginas, perguntas, catálogo e consultas
reais. Resposta livre da IA só com `IA_RESPOSTA_LIVRE=1`, presa aos dados da base.

| Variável | Valores |
| --- | --- |
| `IA_PROVEDOR` | `gemini` ou `openai` (qualquer API compatível: OpenAI, Groq, OpenRouter, **Ollama** e LM Studio locais). Vazio = sem IA |
| `IA_CHAVE` | Chave do provedor (Gemini aceita `GEMINI_API_KEY`). Ollama/LM Studio locais não pedem |
| `IA_URL` | Para `openai`: ex. `http://localhost:11434/v1` (Ollama) |
| `IA_MODELO` | Padrão `gemini-3.5-flash-lite` (validado na Violet Voltage) ou `gpt-4o-mini` |
| `IA_POR_MINUTO`, `IA_TEMPO_MS` | Limite (8/min) e tempo limite (8 s); acima disso fica a resposta local |

Antes de sair: e-mail, telefone, CPF/CNPJ e códigos viram marcadores. A resposta mostra
"Entendi como “…”". As frases continuam indo para `faltas.jsonl`, para o `aprender`.

Resultado medido na Violet Voltage com o Gemini gratuito (mesma ideia, etapa 38 da loja): de
13/20 para 17/20 pedidos difíceis atendidos, ~1 s por chamada, nenhum preço ou produto inventado
nas respostas usadas.

## Limites

- Só o que é público. "Onde está meu pedido?" depende de uma API do site com login: configure
  `consultas.json` (ver [OBSERVAR-E-TREINAR.md](OBSERVAR-E-TREINAR.md)); a consulta é feita pelo
  navegador do visitante no próprio site, com a sessão dele.
- Sites montados só por JavaScript: use `--navegador` (precisa do Playwright).
- Use só em sites seus ou com autorização (o comando pede confirmação; `--sim` confirma).
- Hospedagem gratuita apaga `faltas.jsonl` a cada deploy; baixe antes ou use um disco.
