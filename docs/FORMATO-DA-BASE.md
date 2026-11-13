# Formato da base de conhecimento (versão 1)

Cinco arquivos JSON em `agente/conhecimento/`. Todos são opcionais; o que faltar vira padrão. Ao
carregar, o agente confere tudo: corta textos longos, descarta links perigosos (`javascript:`,
`data:`) e ignora entradas incompletas (o comando `avaliar` lista o que foi ignorado).

## agente.json

```json
{
  "versao": 1,
  "nome": "Assistente Café Aurora",
  "site": "Café Aurora",
  "saudacao": "Oi! Sou o assistente virtual de Café Aurora...",
  "naoEntendi": "Não entendi bem. Pode escrever de outro jeito?",
  "sugestoes": ["Vocês entregam aos sábados?", "Falar com o atendimento"],
  "limiar": 0.55,
  "cor": "#6d28d9",
  "posicao": "direita",
  "moeda": "BRL",
  "endpoint": ""
}
```

- `limiar` (0,3 a 0,95): confiança mínima para responder por intenção. Maior = mais cauteloso.
- `cor`: hexadecimal de 6 dígitos. `posicao`: `"direita"` ou `"esquerda"`.
- `endpoint`: vazio = o agente roda no navegador. Com `"/api/agente"`, o widget pergunta ao seu
  servidor (veja `agente/servidor.js`).
- Nos textos, `{site}` e `{nome}` viram o nome do site e do assistente.

## intencoes.json

```json
{
  "contato": {
    "exemplos": ["quero falar com um atendente", "tem whatsapp?", "qual o telefone"],
    "respostas": ["Você fala com a equipe de {site} pelo WhatsApp (botão abaixo)."],
    "acoes": [{ "rotulo": "Chamar no WhatsApp", "href": "https://wa.me/5541999990000" }],
    "sugestoes": []
  }
}
```

- Pelo menos 2 exemplos (o ideal é 10 ou mais, variados) e 1 resposta. Até 60 exemplos e 6
  respostas (o agente alterna entre elas).
- Nome da intenção: letras, números e `_`.
- `acoes`: até 4 botões. `href`: caminho do site (`/contato`) ou `https://...`.

## faq.json

```json
[
  {
    "id": "voces-entregam-aos-sabados",
    "pergunta": "Vocês entregam aos sábados?",
    "resposta": "Sim. Pedidos feitos até sexta às 12h chegam no sábado.",
    "termos": "fim de semana sabado entrega",
    "link": "/entrega.html"
  }
]
```

A pergunta vale peso inteiro na busca, os `termos` 70% e a resposta 30%. Erros de digitação e
começos de palavra ("pag" → "pagamento") são aceitos.

## paginas.json

```json
[{ "id": "cardapio", "titulo": "Cardápio", "href": "/cardapio.html", "descricao": "Cafés em grão...", "termos": "menu, cafés, preços" }]
```

## catalogo.json

```json
{
  "rotulo": "produtos",
  "itens": [
    { "id": "cafe-cerrado", "nome": "Café Cerrado 250 g", "categoria": "Cafés", "preco": 42.9,
      "descricao": "Torra média", "link": "/produto/cafe-cerrado", "imagem": "/img/cafe.svg", "tags": ["chocolate"] }
  ]
}
```

- `preco` em reais (número). Itens sem preço aparecem, mas não entram em buscas "até R$ X".
- **Catálogo vindo da API do site:** troque `itens` por `"url": "/api/produtos"`. O widget busca a
  lista ao abrir a página. Aceita array ou objeto com array (`data`, `items`, `produtos`...) e
  descobre os campos sozinho (`nome`/`name`/`title`, `preco`/`price`/`priceCents`...). Para forçar:
  `"campos": { "nome": "titulo", "preco": "valor" }`. Para montar o link de cada item:
  `"linkModelo": "/produto.html?id={id}"`.
