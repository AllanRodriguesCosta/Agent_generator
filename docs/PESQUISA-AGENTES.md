# Pesquisa: o que um agente local (sem IA paga) consegue fazer

Este documento junta a análise das ideias do Allan (23/11/2026) com práticas usadas em
chatbots e assistentes de atendimento, e diz o que dá para fazer **sem modelo de linguagem**,
rodando no próprio site, e o que só vem com IA. É a base do [ROADMAP.md](ROADMAP.md).

## 1. As três ideias e o que foi decidido

### 1.1 Bases comuns por setor (Logística, Contabilidade, Arquitetura, Tech, Saúde...)

**Faz sentido e foi implementada (0.7).** É a mesma ideia dos "domain packs" de plataformas de
atendimento e da classificação de sites por taxonomia de conteúdo (IAB Content Taxonomy), usada
em publicidade para saber de que assunto um site trata. A diferença é que aqui a classificação é
feita por **contagem ponderada de sinais** (como os classificadores TF‑IDF clássicos), sem
embeddings nem IA, e o resultado é explicável ("saúde porque *clínica* aparece 20 vezes, *convênio*
13 e o site declara `schema.org/MedicalClinic`").

O que cada base comum traz e por quê:

| Parte | Para que serve | Cuidado tomado |
| --- | --- | --- |
| Sinais (pt e en) | Descobrir o setor no raio X e de novo na observação | Palavras curtas em inglês são exatas (`cart` não conta "cartão") |
| Glossário | Responder "o que é CT‑e?", "what is an API?" com uma definição geral | A definição explica o conceito, **nunca** uma regra do site (prazo, preço, política) e vem marcada "explicação geral" |
| Sinônimos bilíngues | Ampliar a busca: "shipping" acha a página de "Entrega" | Sinônimo vale 60% da palavra escrita, para não passar na frente de um texto que tem a palavra exata |
| Frases típicas | Jeitos de pedir cada interação no setor ("marcar consulta", "book an appointment") | Só entram em interações que existem no site |
| Assuntos de cobertura | A nota de cobertura cobra o que importa no setor (clínica: convênios, preparo de exames; não frete) | — |

**Limite honesto:** o glossário é genérico do setor. Termos de nicho (na Violet Voltage:
"captador", "humbucker") não estão no setor *varejo*; o dono do site acrescenta no
`setor.json` (o formato é o mesmo) ou a observação/IA sugerem. A ordem de prioridade é sempre:
**o que o site diz > glossário geral > "não sei"**.

Doze setores na 0.7: varejo, alimentação, logística, contabilidade e finanças, arquitetura e
construção, tecnologia, saúde, educação, imobiliário, jurídico, beleza e bem‑estar, turismo.

### 1.2 Base complementar de conteúdos (resumo antes de mandar para o original)

**Faz sentido e foi implementada (0.7).** A técnica é a **sumarização extrativa** com
**TextRank** (Mihalcea e Tarau, 2004): o texto vira um grafo de frases, as frases que mais
compartilham vocabulário com as outras são as mais centrais, e as 2 melhores, na ordem original,
formam o resumo. Por que extrativa e não "reescrita":

- **não inventa**: o resumo é feito só de frases do próprio site (um teste confere isso);
- roda em milissegundos, sem modelo, em português ou inglês;
- a resposta é "Resumindo *Check‑up anual*: … O texto completo está no link abaixo", ou seja,
  uma introdução e o encaminhamento para a fonte, como foi pedido.

Ficam de fora README, `docs/` de desenvolvimento e textos técnicos (deploy, npm…): eles explicam
o código, não o site. Documentos `.md` entram quando são conteúdo publicado (blog, guias,
coleções do Astro/Next/Hugo/Jekyll).

**Limite:** extrativo não "funde" informações de vários textos. Isso é trabalho para a IA
opcional (já existente desde a 0.6), que pode receber o resumo e o link como contexto.

### 1.3 Mapa de interações (compra, contato, candidatura, comparação...)

**Faz sentido e foi implementada (0.7).** O vocabulário segue as **Actions do schema.org**
(`BuyAction`, `ScheduleAction`, `ApplyAction`, `CommunicateAction`, `SearchAction`…), que
descrevem "o que dá para fazer" num site e o endereço onde a ação acontece (`target`). O raio X
junta quatro fontes, da mais forte para a mais fraca: formulários (campos e botão), schema.org
`potentialAction`, páginas e links ("Trabalhe conosco", "Seja um parceiro") e, na observação,
os formulários que a pessoa realmente usou.

Dezoito tipos: compra, orçamento, agendamento, reserva, candidatura, contato, suporte, cadastro,
login, inscrição, newsletter, rastreio, comparação, busca, download, doação, avaliação e
parcerias/fornecedores. Cada interação vira uma resposta com: para que serve, o que a pessoa vai
informar (campos reais do formulário, sem senha), se precisa de login (com botão "Entrar na
conta") e o botão que leva até lá. **O agente nunca preenche nem envia nada sozinho.**

## 2. Outras práticas pesquisadas

| Prática | Origem / referência | Situação |
| --- | --- | --- |
| **Recuperação em etapas** ("fallback ladder"): 1ª falha pede confirmação com as opções mais prováveis; 2ª oferece botões; 3ª (ou antes) oferece uma pessoa | Rasa (FallbackClassifier, Two‑Stage Fallback), guias de fallback de Intercom/Tidio; regra comum "escalar depois de 2 falhas ou quando a pessoa pede" | **Feito na 0.7**: "Você quis dizer…?" com até 2 candidatos + "Nenhuma dessas"; na 2ª falha seguida, atendimento humano |
| Separar "não entendi" de "entendi, mas não faço isso" (fora do escopo) | Rasa `out_of_scope`; guias de fallback | Roadmap 0.8 (intenção de fora do escopo por setor: "vocês vendem carro?" numa clínica) |
| Confirmação explícita quando a confiança é média | Guias de design de conversa | Parcial (o "Você quis dizer"); 0.8: confirmar antes de levar a uma interação com login |
| Busca com sinônimos e termos em inglês | Prática comum em busca de sites | **Feito na 0.7** (sinônimos do setor) |
| BM25 no lugar do IDF simples | Padrão de busca lexical (Lucene/Elasticsearch) | Roadmap 0.8: melhora textos longos (conteúdos) |
| Mensagem proativa por página ("Dúvidas sobre o agendamento?") | Intercom, Tidio, Drift | Roadmap 0.8, com limite de 1 aviso por sessão |
| Respostas com cartões, botões rápidos e formulário dentro do chat | Assistentes de lojas | Cartões e botões já existem; formulário no chat fica para 0.9 (com envio pelo próprio site, nunca pelo agente) |
| Passagem para humano com resumo da conversa | Intercom (escalação), Zendesk | 0.8: link de WhatsApp/e‑mail com o resumo da conversa preenchido |
| Painel do dono: perguntas, faltas, taxa de "não entendi" (meta: abaixo de 10%) | Métricas de fallback de plataformas | 0.9 (G5 do roadmap antigo) |
| Multilíngue (responder em inglês quando o site é em inglês) | — | 0.9: textos fixos por idioma + glossário já bilíngue |
| Ações executáveis com permissão (catálogo de ações, MCP) | Schema.org Actions, MCP | 1.0 (G1/G2 do roadmap antigo), sempre com confirmação |

## 3. O limite de um agente sem IA

O que este tipo de agente faz bem: entender pedidos curtos e comuns, achar a resposta certa no
que o site já diz, explicar termos do setor, mostrar onde fazer cada coisa e conversar em etapas
simples. O que ele **não** faz sem IA: entender frases longas e muito fora do padrão, juntar
informações de vários textos numa resposta nova, raciocinar sobre o caso da pessoa. Para isso
existe a IA opcional (Gemini/OpenAI/Ollama), que só reescreve o que o agente não entendeu e
responde com a base, sem inventar.

## Referências

- Mihalcea, R.; Tarau, P. *TextRank: Bringing Order into Texts*. EMNLP 2004.
- Schema.org, *Potential Actions*: https://schema.org/docs/actions.html
- Rasa, *Fallback and Human Handoff*: https://legacy-docs-oss.rasa.com/docs/rasa/fallback-handoff/
- IAB Tech Lab, *Content Taxonomy* (classificação de sites por assunto): https://github.com/IABTechLab/iab-taxonomy-classifier
