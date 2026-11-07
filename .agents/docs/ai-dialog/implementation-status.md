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

## Fase 2 do ADR 002 — pipeline rápido atrás de `AI_PIPELINE`

Desligado por padrão (`AI_PIPELINE=legacy`); com `fast`, cada turno passa por:

1. **Planejador** (`agent/fast/turn-planner.ts`): uma chamada estruturada devolve a intenção (`write`, `read`, `other`, `clarify`) e as operações (`skill`, `create|update`, trecho, dia, `ref`, `linkTo`). Consulta, apagar, recorrência e alterar tarefa/nota voltam ao caminho legado (JEV + agente), marcado em `ai_turn_traces.fast_fallback`. Falha do planejador também cai no legado (`planner_timeout`, ...).
2. **Especialistas** (`agent/fast/entity-specialist.ts`): um por operação, em paralelo, uma chamada estruturada sem ferramentas. O servidor lê o dia (mesma skill `get_day_context`, em paralelo ao modelo); alterar recebe os eventos do dia e só aceita um `id` que esteja nele. Os horários são campos próprios do envelope, antes dos argumentos.
3. **Junção** (`RunAgentUseCase.runFast`): comandos aplicados em ordem na mesma `AgentChangeSession`, com o rearranjo determinístico do dia e `linkTo` resolvido pelo servidor, e um único commit atômico. A nutrição segue no job `meal-note`.
4. **Orçamentos** (`agents.json › fast`): planejador 5 s (tentativa 3 s), especialista 15 s (tentativa 5 s). Uma tentativa travada é refeita com o que sobrou; estourou o orçamento do especialista, o turno falha rápido (`FastStageError`, desfecho `stage_failed`, código `unavailable` ao usuário) sem refazer o turno inteiro.

Configuração: `AI_PIPELINE=legacy|fast`; `OPENROUTER_PLANNER_MODEL` e `OPENROUTER_SPECIALIST_MODEL` (opcionais, caem em `OPENROUTER_MODEL`). Migração `0019` acrescenta `pipeline` e `fast_fallback` à trilha.

### Medição (2026-10-18, `deepseek/deepseek-v4-flash-0731`, 24 pedidos × 3)

`ONEPASSWORD_SCOPE=api-runtime pnpm secrets:exec -- pnpm exec tsx scripts/evaluate-fast-pipeline.ts [--repeat N] [--json saida.json]`

- Plano correto: 71/72. Horário extraído: 33/36 (os 3 erros foram timeouts, não horário errado).
- Planejador p50 0,8 s / p95 1,3 s; especialista p50 0,8 s / p95 1,4 s; juntos p50 1,5 s / p95 2,2 s.
- O raciocínio ligado do modelo custava 1–3 s por chamada curta; as chamadas estruturadas o desligam (`reasoning.enabled=false`). O agente legado não faz isso e provavelmente paga esse custo a cada passo do loop (não alterado).
- **Risco aberto:** o provedor às vezes aceita a requisição e nunca responde. Em sequência, ~3–8% das chamadas; com 4 processos em paralelo chegou a ~40%, com qualquer ordenação de provedor (`latency`, `throughput`, padrão). Antes de ativar `fast`, repetir a avaliação com outro modelo rápido sem raciocínio em `OPENROUTER_PLANNER_MODEL`/`OPENROUTER_SPECIALIST_MODEL`, ou com concorrência parecida com a de produção.
- Alimentos 27/36 é ruído da verificação (plural/acento), não do pipeline.

## ADR 003 — rota por processo, fase A (`AI_PROCESS=on`)

- `POST /api/ai/process` grava o processo e enfileira o despacho; `GET /api/ai/process/:id` devolve passos (rótulo predefinido e estado), entidades e vínculos. Ambos respondem 404 com a flag desligada.
- Migração `0020`: `ai_processes`, `ai_process_steps`, `ai_process_entities`. Filas novas: `process-dispatch`, `process-event-create`, `process-task-create`, `process-note-create`, `process-fallback`, `process-finalize`.
- Agentes em `apps/api/src/api-core/process/agents/*.md` (validados na carga), parâmetros do JEV em `process/jev/*.json`, textos em `process/ui.json`. Modelo: `OPENROUTER_PROCESS_MODEL`, que cai em `OPENROUTER_MODEL`. O `nest build` copia os `.md` para o `dist` (`nest-cli.json › assets`).
- Testado: unitários de configuração, despacho, passos, finalização e fallback (`src/api-core/process/*.test.ts`); integração com Postgres do armazenamento, da atomicidade do `afterWrite` e do lock (`ai-processes.integration.test.ts`); e o exemplo-guia ponta a ponta pelo ciclo de vida real dos jobs (`process-flow.integration.test.ts`).
- Não medido: acerto do JEV de entrada com as 11 perguntas e latência com modelos reais. Falta o conjunto rotulado e o script de avaliação (no estilo de `scripts/evaluate-meal-routing.ts`) antes de ligar a flag fora de desenvolvimento.
- `AI_PROCESS` está em `.env.example`, `turbo.json` e na lista opcional do escopo `api-runtime` em `scripts/onepassword/loader.mjs`; **não** foi adicionada ao `env.tmpl` (exigiria o campo no 1Password).

## ADR 003 — rota por processo, fase B

- Agentes novos em `process/agents/`: `event-edit.md`, `task-edit.md`, `note-edit.md` e `query.md`. Filas: `process-event-edit`, `process-task-edit`, `process-note-edit`, `process-query`.
- Despacho em duas etapas quando há edição: o servidor lista os candidatos e o JEV escolhe com perguntas `edit | keep` (`process/jev/candidates.json`). O passo de edição recebe os escolhidos no `payload` e só aceita ids deles ou da consulta que pedir.
- O passo de consulta executa **uma** consulta de leitura pelo executor com escopo de usuário (`includeChat: false`), guarda até 50 linhas no `result` do passo e `GET /api/ai/process/:id` as devolve em `steps[].result`. Não há segunda chamada ao modelo.
- Sobreposição de eventos não é corrigida na edição: `AgentChangeSession.reviseEvent` revisa só o evento escolhido.
- Testes: `process-edit-worker.test.ts`, `process-query-worker.test.ts`, dispatcher em duas etapas, consulta de candidatos no Postgres e dois fluxos ponta a ponta (editar e consultar) em `process-flow.integration.test.ts`.
- Ainda não medido: acerto das perguntas `edit | keep` e a latência da segunda chamada ao JEV com modelos reais.
- Limites conhecidos: edição de nota só altera o texto de notas do tipo texto (nota de refeição é recusada pela sessão como `rejected`); só campos informados mudam, não há como limpar um campo.

## ADR 003 — rota por processo, fase C

- Agentes novos em `process/agents/`: `recurring-event-create.md`, `recurring-task-create.md`, `recurring-event-edit.md`, `recurring-task-edit.md`, `failure-explainer.md`; `fallback.md` reescrito para responder ou chamar especialistas. Filas: `process-recurring-event-create`, `process-recurring-task-create`, `process-recurring-event-edit`, `process-recurring-task-edit`. Todas as perguntas do JEV de entrada agora têm agente.
- Séries: regra do domínio montada em `process/process-recurrence.ts` com os padrões do servidor (09:00 sem horário). Template sem notas. Editar vale de hoje em diante e mantém as notas da série.
- Fallback: `ProcessStore.handOff` cria os passos chamados e termina o passo do fallback na mesma transação. Máximo de 6 especialistas por chamada.
- `failure-explainer`: uma chamada só quando algum passo falha, no fechamento do processo, guardada em `ai_processes.response.explanation` e usada em `GET /api/ai/process/:id › message`.
- Corrigido na fase: o módulo não passava o repositório de recorrências aos workers (a edição de série falharia em produção); o teste ponta a ponta com Postgres cobre criar e editar uma série.
- Testes: `process-recurrence.test.ts`, fallback orquestrador, explicação de falha e séries na finalização (unitários); candidatos de série no Postgres e quatro fluxos novos ponta a ponta (fallback orquestrando, fallback respondendo, criar e editar série, falha com explicação).
- Ainda não medido: acerto do JEV de entrada com as 11 perguntas, do fallback ao escolher especialistas e do `failure-explainer` com modelos reais; latência fim a fim.
- Limites conhecidos: série não pode ser apagada por esta rota; o horário padrão 09:00 é uma escolha do servidor; passos de edição chamados pelo fallback não têm candidatos escolhidos pelo JEV.

## ADR 003 — rota por processo, fase D (clientes)

- Contrato `AiProcessDto` em `packages/contracts` (+ schema Zod `aiProcess`, fixture `ai-process.json` e teste `apps/mobile/contracts/ai-process.test.ts`). O tipo do servidor (`ProcessView`) passou a ser o do contrato.
- Web: `lib/ai-process/ai-process.ts`, mensagem `process` em `useAgentChat` (com `processApi` injetável) e `ProcessBox` no painel do chat.
- Android: `ProcessApi`/`ProcessRepository`/`ProcessGateway` em `data/chat`, `AiProcessDtos.kt`, papel `Process` em `AgentChatViewModel` e `ProcessBox.kt`; `braidSuccess()` no tema.
- Descoberta: 404 ao iniciar = rota desligada no servidor; o chat segue pelo caminho de sempre e não tenta de novo na sessão.
- Testes: `use-agent-chat-process.test.ts` e `process-box.test.tsx` (web); `AiProcessContractTest`, `ProcessRepositoryTest`, `ProcessBoxTest` e seis casos novos em `AgentChatViewModelTest` (Android, compilados e executados com Gradle: `testDebugUnitTest`, `ktlintCheck` e `lintDebug` passam).
- Não validado: a tela no aparelho ou emulador (Compose renderizado) e a caixa no navegador; só testes de lógica, de componente (web) e de compilação/lint (Android).
- Limites: a caixa não entra no histórico da conversa e não há cancelamento depois da entrega às filas.

