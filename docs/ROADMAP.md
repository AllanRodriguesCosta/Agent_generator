# Roadmap do Agent Generator (a partir da 0.7)

Objetivo: chegar perto do limite do que um agente **local, gratuito e sem IA obrigatória**
consegue fazer, e deixar a IA opcional só para o que realmente precisa dela. A pesquisa que
justifica cada item está em [PESQUISA-AGENTES.md](PESQUISA-AGENTES.md). O histórico anterior
(0.3 a 0.6) continua em [MELHORIAS.md](MELHORIAS.md).

Legenda: ✅ feito · 🔜 próxima versão · ⏳ depois

## 0.7 — Domínio, conteúdo e interações ✅ (23/11/2026)

| # | Item | Situação |
| --- | --- | --- |
| H1 | **Bases comuns por setor**: 12 setores com sinais (pt/en), glossário, sinônimos bilíngues, frases típicas e assuntos de cobertura; detecção no raio X e de novo na observação; `setor` no CLI e `--setor` para escolher à mão | ✅ |
| H2 | **Base complementar de conteúdos**: seções informativas viram resumos extrativos (TextRank) com link para o original; README e docs técnicos ficam de fora | ✅ |
| H3 | **Mapa de interações**: 18 tipos (compra, orçamento, agendamento, candidatura, parceria...) a partir de formulários, schema.org, páginas, links e observação; resposta com para que serve, campos, login e botão | ✅ |
| H4 | **Recuperação em etapas**: "Você quis dizer...?" com candidatos e "Nenhuma dessas"; na 2ª falha seguida, atendimento humano | ✅ |
| H5 | Busca com sinônimos do setor (sinônimo vale 60%; a melhor parte do texto conta) | ✅ |
| H6 | Avaliação e cobertura sensíveis ao setor (clínica não é cobrada por frete) | ✅ |
| H7 | FAQ técnica dos docs (deploy, npm...) fora do agente | ✅ |

Arquivos novos na base: `setor.json`, `conteudos.json`, `interacoes.json`
([DOMINIO-CONTEUDO-INTERACOES.md](DOMINIO-CONTEUDO-INTERACOES.md)).

## 0.8 — Conversa mais natural 🔜

| # | Item | Por quê |
| --- | --- | --- |
| I1 | **Fora do escopo por setor** ("vocês vendem carro?" numa clínica): resposta "isso não é com a gente" + o que o site faz | Diferenciar "não entendi" de "não fazemos isso" |
| I2 | **Passar para humano com resumo**: link de WhatsApp/e‑mail com as últimas mensagens já escritas | Atendimento continua sem a pessoa repetir tudo |
| I3 | **BM25** no lugar do IDF simples | Conteúdos longos e catálogos grandes ranqueiam melhor |
| I4 | **Mensagem proativa por página** (1 por sessão, configurável): "Dúvidas sobre o agendamento?" | Agente aparece na hora certa |
| I5 | **Confirmação antes de levar a uma interação com login** | Menos frustração para quem não tem conta |
| I6 | Editor visual com as três bases novas (glossário, conteúdos, interações) | Ajuste sem editar JSON |
| I7 | Glossário próprio do site: termos repetidos nas páginas sem definição viram sugestão no `aprender` | Cobre nichos (ex.: "captador" na Violet Voltage) |
| I8 | Tom configurável (formal, descontraído) e variações de resposta | Menos repetição |

## 0.9 — Ação e medição ⏳

| # | Item |
| --- | --- |
| J1 | **Formulário curto dentro do chat** que só preenche a página do próprio site (a pessoa confere e envia) |
| J2 | **Painel do dono** no modo servidor: perguntas mais feitas, taxa de "não entendi" (meta abaixo de 10%), interações mais pedidas |
| J3 | Respostas em inglês/espanhol quando o site está nesse idioma (textos fixos por idioma; glossário já é bilíngue) |
| J4 | Setores novos por contribuição (um arquivo por setor, com teste automático de qualidade) |
| J5 | Atualização incremental: rodar de novo mescla páginas, conteúdos e interações novas sem perder edições (E3) |

## 1.0 — Plataforma ⏳

| # | Item |
| --- | --- |
| K1 | Catálogo de ações (`acoes.json`) com parâmetros e permissão; a IA opcional escolhe a ação (G1) |
| K2 | Servidor MCP expondo as mesmas ações para outros assistentes (G2) |
| K3 | Verificação de domínio antes de ler um site como serviço hospedado (G4) |
| K4 | Publicação no npm e executável assinado (E5) |

## Como cada versão é validada

- Testes automáticos (`npm test`), incluindo um site de exemplo por setor novo
  (`tests/fixtures/`).
- `agent-generator avaliar`: acerto geral e a parte "Glossário do setor, conteúdos e
  interações".
- Teste em projeto real (Violet Voltage e o café de exemplo) antes de publicar a versão.
