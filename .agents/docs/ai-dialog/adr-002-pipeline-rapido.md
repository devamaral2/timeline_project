# ADR 002 — Pipeline rápido: planejador, especialistas estruturados e commit único

Status: **proposto**. A fase 1 (observabilidade e avaliação) é implementada sem mudar o comportamento; as demais fases só começam depois de ler os números dela.

## Contexto

O diálogo com a IA ficou lento e frágil, principalmente para eventos de alimentação (o caso mais importante do produto). Dois sintomas relatados:

1. O turno demora minutos e termina em erro ou timeout.
2. O pedido cai no agente complexo, o caminho mais lento.

O que o código faz hoje (ADR 001):

- JEV (`jev-latest`, timeout 8 s) classifica `goal`, `count` e `target`. Qualquer uma das três respostas com certeza `≤ 0,92` manda o pedido ao agente **complexo**. "Comi 200g de arroz, 200g de feijão e 200g de carne moída" tem três alimentos e pode ser lido como `count=many`.
- O agente do OpenRouter roda um **loop de ferramentas** (até 12 passos, 120 s) e é obrigado a chamar `get_day_context` antes de qualquer evento. O contexto do dia é conhecido pelo servidor assim que o horário é extraído, mas hoje custa rodadas do modelo.
- Falhas do agente (`LlmUnavailableError`, `TimeoutError`, `AbortError`) são **retentáveis** no `AiJobsService` (`AI_JOBS_MAX_ATTEMPTS`, padrão 4). Cada tentativa refaz JEV + loop inteiro.
- O `claim` serializa os turnos `agent-turn` **por usuário**. Um turno preso ou em retentativa bloqueia todos os seguintes do mesmo usuário. Com 4 tentativas de até 120 s, um único pedido ocupa a fila por vários minutos, e o re-publicador só reentrega a cada 30 s enquanto o usuário está ocupado.
- O único registro de tempo é `console.info("[AgentTurn] timings")`, emitido **apenas em sucesso**. Turnos que estouram o tempo ou falham não deixam nenhum número, e nada é consultável.

A hipótese de que o gargalo é o loop do agente (e não o número de agentes) vem da leitura do código. Ela ainda não foi medida.

## Decisão proposta

### Fase 1 — medir (esta entrega, sem mudar comportamento)

- Um `TurnTrace` por tentativa de turno, gravado também quando o turno falha, estoura o tempo ou é cancelado. Guarda apenas números, nomes de etapa e códigos: nunca o texto do usuário.
- Tabela `ai_turn_traces` para consultar por SQL: latência por etapa (`route`, `agent`, `reads`, `commands`, `commit`), espera na fila, número da tentativa, rota e motivo do fallback, medidas do JEV, chamadas de ferramenta com duração, desfecho e código de erro.
- Conjunto de avaliação de refeições em português (`scripts/evaluation/meal-cases.json`) com rota esperada e extração esperada, e um relatório de roteamento (acerto, fallback seguro, erro de rota, p50/p95 de latência do JEV).

### Fase 2 — pipeline rápido atrás de uma flag (`AI_PIPELINE=legacy | fast`)

1. **Planejador**: uma chamada com saída estruturada devolve a lista de operações do pedido, por exemplo `[{ entity: "event", op: "create", span: "comi 200g de arroz…" }]`. Relato simples gera 1 operação; "almocei às 12, treinei às 18 e adiei a reunião" gera 3. O planejador pode ser o JEV ou um modelo rápido; a escolha sai da avaliação.
2. **Especialistas por entidade** (evento, tarefa, nota) em paralelo, um por operação. Cada um faz **uma chamada estruturada, sem loop de ferramentas**. O servidor carrega o contexto do dia antes da chamada, a partir do horário extraído.
3. **Junção por `Promise.all` dentro do job.** Todos os comandos validados entram na mesma `AgentChangeSession`, passam pelo rearranjo determinístico e vão num único commit. Vínculos entre entidades da mesma mensagem usam referências locais do plano. Não há lock distribuído: a atomicidade já existe.
4. **Confirmação rápida.** O servidor monta a resposta logo após o commit; a nutrição continua no job `meal-note`.
5. **Orçamento por etapa** (planejador ~5 s, especialista ~15 s). Estourou: erro visível e rápido, sem retentar o turno inteiro. O agente complexo vira último recurso, marcado como tal na trilha.
6. **Consulta pura** mantém o loop com `query_data`, único lugar onde ele se justifica.

### Fase 3 — comparar e ativar

Avaliação offline do mesmo conjunto nos dois caminhos, depois canário por usuário. A flag só muda de padrão com a evidência de acerto, p95 de latência e custo.

## Alternativas consideradas

- **Uma fila por tipo de entidade, com lock e vínculo no fim.** Rejeitada para a maioria dos casos. Para refeição, evento e nota já nascem ligados no mesmo commit (`save_meal_event` + `buildNote`); filas separadas criariam escritas parciais que podem falhar pela metade e exigiriam reconciliação. O paralelismo útil existe só na extração, que a fase 2 já cobre dentro de um job.
- **Uma fila com um agente que tem todas as skills.** É o caminho `complex` de hoje, o mais lento.
- **Manter o agente com ferramentas, só trocando o roteador.** Não ataca o loop nem as retentativas.

## Consequências

- Pedidos simples tendem a custar 2 chamadas curtas (planejador e especialista) em vez de JEV + loop de até 12 passos.
- A qualidade do especialista sem ferramentas depende de o planejador extrair o horário certo ("uma hora atrás"). O conjunto de avaliação precisa cobrir horários relativos, sem horário e cruzando a meia-noite.
- Retentativa de turno com `TimeoutError` deve deixar de refazer o pipeline inteiro (decisão da fase 2, a confirmar com os dados de `attempt`).
- Dados de trilha crescem por tentativa de turno; definir retenção (sugestão: 30 dias) antes de produção.

## Perguntas que a fase 1 deve responder

1. Qual fração dos turnos de refeição cai em `complex` e por quê (`goal`, `count`, `target` ou falha do JEV)?
2. Qual a distribuição de `agent − reads` (tempo do modelo) e de `reads` (leituras) nos turnos lentos?
3. Quantos turnos usam mais de uma tentativa, e quanto tempo de fila o usuário espera atrás de um turno em retentativa?
4. Quanto do tempo de `commands` é o parse de refeição pelo modelo?

## Referências

- [ADR 001 — Roteamento por JEV](./adr-001-routing.md)
- [Estado da implementação](./implementation-status.md)
- `apps/api/src/api-core/agent/services/turn-trace.ts`
- `scripts/evaluate-meal-routing.ts`
- [`turn-trace-queries.sql`](./turn-trace-queries.sql)
- `apps/api/src/api-core/agent/testing/evaluation/meal-cases.json`
