# 06: Contrato de tarefa

**What to build:** O que a API e o web trocam pela rede passa a falar de tarefa. Os esquemas, tipos e campos do pacote de contratos e do pacote de timeline ganham nome de tarefa (`TaskDto`, `TaskStatus`, `taskId`, `previousTaskIds`, `nextTaskIds`, o lote com a lista de tarefas e a sequência entre tarefas), e todos os consumidores mudam junto: o DTO e a validação de entrada da API, o cliente e a API falsa do web e os esquemas do MCP. As rotas ainda são as atuais.

**Blocked by:** 01 (Liberar o nome Task no web), 03 (Varredura de resíduos com linha de base)

**Status:** done

**Leia antes:** o [README](README.md). Spec: "Contratos e timeline" e "Decisões de teste", costuras 1 e 2.

- [x] Nenhum esquema, tipo ou campo do pacote de contratos tem "event" no nome; não há reexportação com o nome antigo.
- [x] Os campos JSON passam a `taskId`, `taskIds`, `previousTaskIds` e `nextTaskIds`, e o lote do agente usa a lista de tarefas e a sequência entre tarefas.
- [x] As funções e tipos do pacote de timeline (agrupamento por dia, posição na grade, chaves de dia, endereço do dia, cartão da agenda) têm nome de tarefa.
- [x] A API valida e responde com os campos novos; a API falsa do web confere corpos e respostas contra os esquemas novos; o MCP usa os esquemas novos.
- [x] Um corpo com `eventId` ou `previousEventIds` é recusado como entrada inválida pela API.
- [x] Os testes de contrato do mobile são rodados (continuam quebrados, por decisão).
- [x] `pnpm run test:unit` e `pnpm run typecheck` verdes; as áreas "contratos" e "timeline" saem da linha de base.
