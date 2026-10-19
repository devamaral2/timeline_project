# Implementação do diálogo com IA

## Entregue

- `JEV_API_KEY` carregada pelo escopo `api-runtime` do 1Password e usada apenas no servidor. A API falha ao iniciar em produção se a variável estiver ausente.
- Roteamento JEV comum a REST e chat, com três perguntas `Choice` em uma chamada e dois limiares estritos (`confidence` e probabilidade da escolha acima de `0,92`) para cada decisão usada. Falha do provedor leva ao agente complexo. O log registra rota, versão do modelo, confiança e latência sem guardar a chave nem o texto do usuário.
- Agente de consulta com `query_data` e `get_day_context`; agente de uma entidade com sua skill de escrita e as duas consultas; agente complexo com as skills de escrita existentes. O servidor valida o JSON interno, executa os comandos uma vez e gera `agentResponse` após preparar e confirmar o lote.
- Consulta diária SQL parametrizada por usuário e data, incluindo eventos que atravessam a meia-noite, itens, pausas, tags, tarefas e notas vinculadas. A ferramenta pagina resultados grandes e exige que todas as páginas sejam lidas antes de alterar eventos.
- Título `name` para notas em entidade, contrato, repositório e migração `0014`; notas antigas recebem a primeira linha útil do conteúdo, com fallback `Nota`.
- Rearranjo determinístico dos eventos seguintes atingidos, preservando duração e parando na primeira folga. Mudanças já preparadas no mesmo pedido participam do cálculo. Ocorrências recorrentes são destacadas pela revisão da entidade. Empate entre inícios atingidos gera pedido de ordem sem gravar o lote.
- Script de comparação [`scripts/evaluate-jev-routing.ts`](../../../scripts/evaluate-jev-routing.ts), executável com `ONEPASSWORD_SCOPE=api-runtime pnpm secrets:exec -- pnpm exec tsx scripts/evaluate-jev-routing.ts`.

## Avaliação de roteamento

Em 2026-09-27, com `jev-latest` resolvendo para `jev-1.13.0`, foram executados 14 exemplos rotulados em português: 9 rotas esperadas, 5 fallbacks seguros para o agente complexo e 0 rotas incorretas. Os fallbacks ocorreram quando uma das duas medidas de certeza ficou em `0,92` ou menos. A amostra é pequena; ampliar os casos rotulados com pedidos reais para medir cobertura e custo ao longo do uso.

## Verificação

- `pnpm run --silent test:unit:ai`: passou.
- `pnpm run --silent test:integration:ai -- --project api-integration`: passou, incluindo a nova migração e a consulta diária no PostgreSQL.
- `pnpm --filter @repo/api run build`, `typecheck` e `lint`: passaram.
- `pnpm --filter @repo/web run typecheck` e `pnpm --filter @repo/mobile run typecheck`: passaram.

Quando um evento novo começa dentro de outro já existente, a implementação pede qual evento deve manter o horário. Essa escolha ainda depende da resposta do usuário à pergunta feita durante o planejamento.

## Fase 1 do ADR 002 — observabilidade e avaliação (sem mudar comportamento)

- `ai_turn_traces` (migração `0018`): uma linha por tentativa de turno, gravada também em falha, timeout e cancelamento. Guarda rota, decisão do JEV (inclusive `fallbackReason`), tempo por etapa, chamadas de ferramenta com duração, desfecho, código de erro, tentativa e espera desde o envio. Nunca guarda texto do usuário ou do modelo. Consultas prontas em [`turn-trace-queries.sql`](./turn-trace-queries.sql).
- A gravação da trilha é best-effort: falha no banco vira `console.warn` e não altera nem atrasa o turno.
- O roteador JEV passou a informar por que mandou um pedido ao agente complexo (`goal_uncertain`, `count_many`, `target_uncertain`, `provider_timeout`, `no_api_key`...). A rota escolhida é a mesma de antes.
- Conjunto de avaliação de refeições (24 pedidos) em `apps/api/src/api-core/agent/testing/evaluation/meal-cases.json` e relatório de roteamento: `ONEPASSWORD_SCOPE=api-runtime pnpm secrets:exec -- pnpm exec tsx scripts/evaluate-meal-routing.ts [--repeat N] [--json saida.json]`.
- Ainda não medido: o relatório de roteamento e as consultas SQL precisam rodar contra a API real. Só depois disso as fases 2 e 3 do ADR devem começar.
