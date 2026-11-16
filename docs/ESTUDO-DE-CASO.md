# Agent Generator como projeto de engenharia

Este documento apresenta o escopo implementado, as decisões técnicas e os limites do Agent Generator para demonstrações e avaliação técnica. Não substitui o [roadmap de produto](ROADMAP-PRODUTO.md): funcionalidades planejadas não devem ser apresentadas como concluídas.

## Problema e proposta

Sites pequenos precisam oferecer respostas e navegação com base no próprio conteúdo. O Agent Generator analisa projetos ou páginas públicas, gera uma base editável e instala um chatbot. A proposta prioriza execução local sem IA obrigatória e permite integração opcional com provedores de modelos.

O motor surgiu a partir do assistente do Violet Voltage e foi adaptado para outros projetos. O ganho de engenharia está em separar conteúdo, interpretação, instalação e interface, tornando essas partes reutilizáveis.

## Escopo existente

- CLI em Node.js com JavaScript ES modules, comandos de análise, geração, instalação, avaliação e conversa.
- Scanner para conteúdo de projetos e crawler para sites públicos.
- Base de conhecimento em JSON, widget web e editor visual.
- Classificação local com Naive Bayes, busca por relevância, entidades de catálogo e contexto curto de conversa.
- Observação e correção assistida para melhorar a base.
- Conector opcional de IA para interpretar perguntas não compreendidas localmente.
- Avaliação de intenções, FAQ, páginas e frases adicionais, com relatórios de cobertura e variações.
- Scripts de geração de executáveis e configuração de CI para testes e demonstrações em múltiplos sistemas.

A existência desses componentes no repositório não comprova compatibilidade universal, ausência de falhas ou aprovação da execução mais recente de CI.

## Arquitetura e caminhos de leitura

| Área | Código | Responsabilidade |
| --- | --- | --- |
| Interface de terminal | `bin/`, `src/cli/` | Orquestrar o fluxo de uso |
| Coleta | `src/scanner/`, `src/crawler/` | Extrair informações de arquivos e páginas públicas |
| Geração e instalação | `src/generator/`, `src/installer/` | Criar conhecimento e instalar os arquivos do agente |
| Conversa | `src/agent/` | Classificar, buscar, manter contexto e integrar IA opcional |
| Interface web | `widget/`, `src/editor/` | Atendimento e revisão visual da base |
| Aprendizado assistido | `src/observe/`, `src/train/`, `src/learn/` | Registrar observações e aplicar correções |
| Avaliação | `src/eval/`, `tests/` | Medir comportamento e testar regressões |
| Capacidades | `src/capabilities/glossary.js` | Classificar interações candidatas, inicialmente bloqueadas |

## Decisões e limites

### Execução local e dependências

O pacote não declara dependências de produção ou desenvolvimento. O motor local reduz a necessidade de serviços externos, mas também limita a compreensão de linguagem livre. Manter parsers, instalação e distribuição no próprio projeto exige testes e manutenção; ausência de dependências não é garantia automática de qualidade.

### IA opcional

O caminho padrão de `withIa` tenta responder localmente. Quando há uma falha de compreensão, a IA pode reescrever a pergunta para uma nova tentativa na base. Há configuração de timeout e limite de chamadas.

A implementação também possui a opção `IA_RESPOSTA_LIVRE`, que permite texto gerado pelo modelo. Portanto, não é correto afirmar que todos os modos respondem exclusivamente com textos da base. Instruções no prompt para restringir fatos não garantem ausência de alucinação. A introdução do README que diz que IA nunca atua em tempo real precisa ser reconciliada com esse comportamento.

### Capacidades e segurança

O glossário classifica rotas e formulários como candidatos e inicia seu estado como bloqueado. Isso é um inventário inicial, não um sistema completo de autorização de ações. Validação de identidade, argumentos, contexto e confirmação no servidor faz parte da evolução prevista no roadmap.

As regras do projeto orientam não ler arquivos de segredo no scanner e não registrar cookies ou tokens na observação. Essas intenções devem continuar sendo verificadas por testes; não representam certificação de segurança.

### Métricas de avaliação

Em `src/eval/index.js`, o acerto geral combina exemplos da base, perguntas frequentes, páginas e frases extras fornecidas. A avaliação de generalização que retira cada exemplo do treino e as variações geradas são reportadas separadamente e não entram no indicador geral.

Assim, o acerto geral mede principalmente consistência da base e os casos fornecidos. Não deve ser divulgado como precisão com usuários reais sem um conjunto independente de avaliação. Uma evolução recomendada é separar perguntas de treino e teste, medir falsos entendimentos e reportar os resultados por categoria.

## Validação e demonstração reproduzível

Com Node.js 20 ou superior, na pasta do projeto:

```sh
npm test
npm run demo
node bin/agent-generator.js conversar .demo/cafe-aurora "oi" "quero um café até 50 reais"
```

Para a geração de executáveis, consultar [EXECUTAVEL.md](EXECUTAVEL.md) e os requisitos de Node específicos do build. A configuração de CI está em `.github/workflows/ci.yml`.

Uma demonstração útil deve mostrar:
1. O conteúdo de entrada e os fatos realmente encontrados.
2. A geração e instalação no exemplo.
3. Uma resposta correta, uma pergunta fora do escopo e uma correção no editor.
4. O relatório de avaliação com suas limitações.
5. O comportamento sem chave de IA e, quando configurado, o fallback opcional.

Guardar o commit avaliado, sistema, versão de Node, comandos e resultados torna a demonstração verificável. Este documento não registra uma nova execução dos testes nem um benchmark.

## O que ainda está planejado

Conforme [ROADMAP-PRODUTO.md](ROADMAP-PRODUTO.md):

- Concluir e revisar o catálogo de capacidades e melhorar avaliação de sinônimos e lacunas.
- Criar console gráfico para o fluxo completo de configuração, revisão e publicação.
- Versionar a base e oferecer comparação, restauração e mesclagem incremental.
- Desenvolver integração WordPress e diagnóstico de publicação.
- Validar ações estruturadas no servidor e exigir aprovação para efeitos colaterais.
- Acrescentar indicadores operacionais, retenção configurável e regressões de segurança.

Essas entregas devem avançar segundo o roadmap existente. Este documento não adiciona compromissos de prazo nem altera sua ordem.

## Como apresentar o projeto

Descrição curta: “Ferramenta em Node.js que analisa projetos e sites públicos, gera bases de conhecimento e instala chatbots com processamento local e integração opcional com IA.”

Em entrevistas, explicar uma decisão com alternativas e consequências: por que processar localmente; como separar dados do motor; como tratar falhas de provedores; por que medir generalização separadamente; e como limitar ações propostas por modelos.

Diferenciar implementação existente, comportamento testado e planejamento. O uso de ferramentas de IA na construção não substitui revisão, testes nem a capacidade de explicar e manter o código. Métricas de usuários, economia de tempo, cobertura e compatibilidade devem ser apresentadas somente quando medidas.
