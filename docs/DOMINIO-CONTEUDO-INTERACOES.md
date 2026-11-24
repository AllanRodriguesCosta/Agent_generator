# Setor, conteúdos e interações (versão 0.7)

Três bases novas que o Agent Generator cria sozinho, sem IA, e que deixam o agente responder
mais coisas sem precisar de frases escritas à mão. Pesquisa e motivos:
[PESQUISA-AGENTES.md](PESQUISA-AGENTES.md).

```
agente/conhecimento/
  setor.json        setor do site + glossário comum (pt/en) + sinônimos
  conteudos.json    resumos das seções informativas, com link para o original
  interacoes.json   o que dá para fazer no site, para que serve, o que pedir e onde fica
```

## Como o processo usa cada uma

1. **Raio X (`analisar`/`criar`/executável, parte 1).** Lê páginas, seções, formulários, links,
   rotas e o JSON‑LD (tipos e `potentialAction` do schema.org). Gera o ranking de setores, os
   resumos e o mapa de interações.
2. **Observação (`observar`, parte 1+ / 2).** Com o site rodando, o texto das páginas visitadas
   entra na detecção de novo (o setor só muda com evidência forte ou se antes não havia setor) e
   cada formulário que a pessoa usou vira uma interação, com os campos reais (senha nunca entra).
3. **Conversa.** O agente usa, nesta ordem: o que o site diz (FAQ, páginas, conteúdos,
   interações, catálogo) → glossário geral do setor → "Você quis dizer...?" → atendimento humano.

## setor.json

```json
{
  "id": "saude",
  "nome": "Saúde",
  "secundario": "",
  "confianca": 1,
  "forcado": false,
  "glossario": [
    { "id": "carencia", "termo": "Carência", "sinonimos": ["waiting period"], "definicao": "Tempo após a contratação do plano..." }
  ],
  "sinonimos": [["consulta", "atendimento", "appointment", "visita"]],
  "ranking": [{ "id": "saude", "nome": "Saúde", "pontos": 75.7, "evidencias": ["clinic (20x)", "convenio (13x)"] }]
}
```

- Pode acrescentar termos do seu negócio no `glossario` (mesmo formato). Ex.: na Violet Voltage,
  `{ "termo": "Captador", "sinonimos": ["pickup", "humbucker", "single coil"], "definicao": "..." }`.
- `forcado: true` (gravado pelo `setor --setor <id>`) impede a observação de trocar o setor.
- Perguntas respondidas: "o que é carência?", "what is telemedicine?", "o que significa CT‑e?".
  A resposta termina com "(explicação geral)" e, se o site fala do assunto, traz o botão para lá.

### Comandos

```bash
agent-generator setor ./meu-site                 # ranking com as evidências
agent-generator setor ./meu-site --setor saude   # troca o setor (backup da base antes)
agent-generator criar ./meu-site --setor geral   # gera sem base setorial
```

Setores: `varejo`, `alimentacao`, `logistica`, `financas`, `construcao`, `tecnologia`, `saude`,
`educacao`, `imobiliario`, `juridico`, `beleza`, `turismo` (e `geral` = nenhum).

### Como acrescentar um setor

Em `src/domain/sectors.js`, um objeto com `id`, `nome`, `sinais` (`[começo-de-palavra, peso]`;
`"palavra!"` = palavra exata), `schema` (tipos schema.org), `glossario`, `sinonimos` e `frases`
(por tipo de interação). Em `src/eval/coverage.js`, os assuntos de cobertura do setor
(`SECTOR_TOPICS`). O teste "bases setoriais" confere o mínimo (10 sinais, 6 termos, sinônimos).

## conteudos.json

```json
[{ "id": "check-up-anual-por-que-fazer", "titulo": "Check-up anual: por que fazer",
   "resumo": "O check-up anual é um conjunto de consultas e exames... O check-up costuma incluir...",
   "topicos": "check-up anual exames ...", "link": "/blog/check-up.html" }]
```

- Resumo **extrativo** (TextRank): até 2 frases do próprio texto, na ordem original, até 420
  caracteres. Nada é reescrito, então nada é inventado.
- Entram seções de páginas (título + parágrafos) com pelo menos 2 frases ou 160 caracteres, e
  documentos `.md/.mdx` publicados (`content/`, `blog/`, `posts/`, `guias/`, `src/pages/`...).
  README, `docs/` de desenvolvimento e seções que já são pergunta frequente ficam de fora.
- Perguntas respondidas: "me explica sobre o check‑up", "como funciona o plano", "com que
  frequência devo fazer check‑up?" → "Resumindo "…": … O texto completo está no link abaixo."

## interacoes.json

```json
[{ "id": "agendamento", "tipo": "agendamento", "titulo": "Agendar consulta",
   "resumo": "\"Agendar consulta\" serve para escolher dia e horário de um atendimento. Você vai informar nome completo, telefone, convênio, especialidade e data preferida.",
   "campos": ["nome completo", "telefone", "convênio", "especialidade", "data preferida"],
   "requerLogin": false, "link": "/agendar.html",
   "exemplos": ["quero agendar", "marcar um horário", "book an appointment", "..."] }]
```

- Tipos: compra, orcamento, agendamento, reserva, candidatura, contato, suporte, cadastro, login,
  inscricao, newsletter, rastreio, comparacao, busca, download, doacao, avaliacao, parceria.
- Fontes, da mais forte para a mais fraca: formulário, schema.org `potentialAction` (usa o
  `target`), página/link com o nome da interação, observação.
- Contato, login, cadastro e suporte já têm intenção própria (contato, conta, ajuda): a interação
  vira botão dessa intenção e não divide os exemplos do classificador.
- `requerLogin: true` (página de conta/painel) acrescenta o botão "Entrar na conta".
- Links para `/api/...` nunca viram interação. O agente só explica e leva até a página.

## Recuperação quando o agente não entende

| Situação | Resposta |
| --- | --- |
| 1ª falha com candidatos próximos | "Não tenho certeza se entendi. Você quis dizer:" + até 2 opções + "Nenhuma dessas" |
| "Nenhuma dessas" | Pede outras palavras e mostra os contatos |
| 2ª falha seguida | "Prefere falar com uma pessoa da equipe?" + botões de contato |
| Acerto | Zera a contagem |

`voce_quis_dizer` conta como falta (entra no `aprender` e aciona a IA opcional, se ligada).
