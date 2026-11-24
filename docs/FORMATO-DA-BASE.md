# Formato da base de conhecimento (versão 1)

Treze arquivos JSON (`fluxos.json` e `consultas.json` desde a 0.3; `acoes.json` com as capacidades aprovadas; `setor.json`, `conteudos.json` e `interacoes.json` desde a 0.7; `midias.json` e `perfil.json` desde a 0.8) em `agente/conhecimento/`. Todos são opcionais; o que faltar vira padrão. Ao
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
  "endpoint": "",
  "registro": "",
  "tom": "amigavel",
  "digitacao": 12,
  "recursos": { "catalogo": true, "busca": true, "conta": true, "perfil": true, "formularios": true, "fotos": true, "fluxos": true }
}
```

- `limiar` (0,3 a 0,95): confiança mínima para responder por intenção. Maior = mais cauteloso.
- `cor`: hexadecimal de 6 dígitos. `posicao`: `"direita"` ou `"esquerda"`.
- `endpoint`: vazio = o agente roda no navegador. Com `"/api/agente"`, o widget pergunta ao seu
  servidor (veja `agente/servidor.js`). Começando com `.` (ex.: `"../api/agente"`, versão 0.6), é
  relativo ao endereço do próprio widget: é o que o modo serviço (`site`) usa.
- `registro` (0.4): para onde o widget manda as frases que não entendeu, ex.: `"/api/agente"` (o
  `servidor.js` grava em `agente/faltas.jsonl`). Vazio = ficam só no navegador da pessoa
  (`agente.faltas()` no console; `agente.exportarFaltas()` baixa o JSON para o comando `aprender`).
  Antes de sair do navegador, e-mail, telefone, CPF/CNPJ, códigos e números longos viram
  marcadores.
- Nos textos, `{site}` e `{nome}` viram o nome do site e do assistente.
- `tom` (0.8): `"amigavel"` (padrão), `"formal"` ou `"neutro"`. Muda só as frases de abertura e
  o acolhimento; o conteúdo continua o da base. `"neutro"` desliga as duas coisas.
- `digitacao` (0.8): milissegundos por caractere do indicador "digitando" (0 a 40; teto de 1,2 s).
- `recursos` (0.9): funcionalidades ligadas (`true`, padrão) ou desligadas (`false`), escolhidas
  nos checkboxes do instalador visual: `catalogo`, `busca`, `conta` (consultas da conta),
  `perfil`, `formularios` (interações), `fotos` (galerias) e `fluxos`. Desligar não apaga o
  arquivo correspondente: o agente só deixa de usar aquela parte (`activeView`).

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

## fluxos.json (0.3): conversa em etapas

```json
[
  {
    "id": "entrega",
    "gatilhos": ["como funciona a entrega", "vocês entregam?", "qual o prazo de entrega"],
    "pergunta": "Você prefere entrega ou retirada?",
    "opcoes": [
      { "rotulo": "Entrega", "resposta": "Entregamos em 2 dias úteis.", "proximo": "regiao" },
      { "rotulo": "Retirada na loja", "resposta": "Fica pronto em 1 hora.", "acoes": [{ "rotulo": "Ver endereço", "href": "/contato" }] }
    ]
  }
]
```

- Pelo menos 2 gatilhos, 1 pergunta e 2 opções (até 8). Os gatilhos entram no classificador.
- A resposta da pessoa escolhe a opção pelo texto do botão, por parte dele ("retirada") ou pela
  posição ("a primeira").
- `proximo`: id de outro fluxo, para encadear perguntas.
- O modo treino (`agent-generator treinar`) cria fluxos sem editar JSON.

## consultas.json (0.3): busca do site e dados da conta

```json
{
  "login": "/entrar",
  "buscas": [{ "id": "busca-do-site", "rotulo": "site", "modelo": "/busca?q={termo}" }],
  "dados": [
    {
      "id": "pedidos",
      "rotulo": "pedidos",
      "url": "/api/orders",
      "exemplos": ["onde está meu pedido", "status do meu pedido", "minha compra chegou?"],
      "campos": { "status": "status", "data": "createdAt", "codigo": "id", "total": "totalCents" },
      "pagina": "/minha-conta"
    }
  ]
}
```

- `buscas[].modelo`: caminho do próprio site com `{termo}`. "Procurar X" vira um botão com o link.
- `dados[].url`: rota GET do próprio site que lista registros da pessoa logada. O widget chama com
  a sessão (cookie) dela; 401/403 viram "entre na sua conta" com o botão de `login`.
- `campos` é opcional: sem ele, o agente descobre código, status, data, total e nome pelos nomes
  mais comuns (`status`, `situacao`, `createdAt`, `total`, `totalCents`...). Campo com `cents` no
  nome é dividido por 100.
- `auth` (0.5, opcional): para sites que guardam o login no navegador e mandam
  `Authorization: Bearer`. Ex.: `"auth": { "tipo": "bearer", "onde": "localStorage", "chave": "auth", "campo": "accessToken" }`.
  O widget lê o token dessa chave (e do campo, se o valor for JSON) só na hora da consulta e manda
  para a rota do próprio site. Sem `auth`, vale o cookie da sessão.
- A observação (`agent-generator observar`) preenche este arquivo sozinha, inclusive o `auth`
  (ela anota só o **nome** da chave que guarda o token, nunca o valor).

## acoes.json (0.7): catálogo de capacidades

```json
{
  "versao": 1,
  "padrao": "negar",
  "acoes": [
    {
      "id": "abrir-contato",
      "tipo": "navegar",
      "rotulo": "Abrir Contato",
      "href": "/contato",
      "permissao": "publico",
      "confirmacao": false
    }
  ]
}
```

O gerador cria esse arquivo a partir das páginas públicas encontradas. Ele é o contrato de escopo
para integrações futuras com IA: o padrão é sempre `"negar"`. Na versão atual, a única capacidade
aceita é `"navegar"` para caminho interno do próprio site; links externos, chamadas de API,
pagamentos, mudanças de dados e comandos são descartados. O widget ainda usa seus botões normais:
este arquivo não concede a uma IA poder extra.

O campo `candidatas` é informativo e sempre começa bloqueado. O raio X pode listar rotas e
formulários classificados pelo glossário como `consulta`, `dados_da_conta`, `dados_pessoais`,
`autenticacao`, `escrita`, `alteracao` ou `pagamento`, com risco médio, alto ou crítico. A presença
de uma candidata não autoriza o chatbot, uma IA ou o servidor a chamá-la.

## Catálogo: entidades e memória (0.4)

Nada novo para escrever: o agente tira do próprio `catalogo.json`
- **categorias** (campo `categoria`), **cores** (no nome ou nas tags: "preto", "azul"...),
  **marcas** (primeira palavra do nome repetida em 2+ itens, ou tag `marca:Nike`) e **tamanhos**
  (tags `P`, `M`, `G`, `38`, `tamanho M`);
- e guarda no contexto da conversa os filtros e os itens mostrados (`filtros`, `ultimos`).

Assim funcionam "tem tênis preto da Nike até 300?", "e em azul?", "o mais barato",
"compara os dois" e "me fala do segundo". Cor que nenhum item tem recebe "Não encontrei... Tenho em:
preto, branco".

## setor.json, conteudos.json e interacoes.json (0.7)

Gerados pelo raio X (e refinados pela observação): setor do site com glossário e sinônimos em
português e inglês, resumos das seções informativas com link e o mapa do que dá para fazer no
site. Formato, regras e exemplos: [DOMINIO-CONTEUDO-INTERACOES.md](DOMINIO-CONTEUDO-INTERACOES.md).
Ao carregar, o agente confere: glossário sem termo ou definição, conteúdo sem resumo e interação
sem link são ignorados; links perigosos são descartados. Bases antigas continuam funcionando:
`gerar` sem `--forcar` só escreve os arquivos que ainda não existem.

## midias.json e perfil.json (0.8)

- `midias.json`: `{ "galerias": [{ id, titulo, etapa, grupo, link, termos, itens: [{ src, legenda, data }] }] }`.
  Até 80 galerias e 60 fotos por galeria; `data` no formato AAAA-MM-DD (ou vazio); `src` e `link`
  passam pela mesma conferência de links seguros.
- `perfil.json`: `{ ativo, fonte, validadeMin, pagina, apelidos, perguntas: [{ id, rotulo, exemplos, resposta, midia, grupo, acoes }] }`.
  `fonte` só aceita caminho do próprio site; pergunta sem resposta ou com menos de 2 exemplos é
  ignorada; com `ativo: false` (padrão gerado) as perguntas não entram no classificador.

Como gerar, editar e ligar: [CONTEXTO-E-MIDIA.md](CONTEXTO-E-MIDIA.md).
