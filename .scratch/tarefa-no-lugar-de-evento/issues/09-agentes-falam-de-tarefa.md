# 09: Agentes falam de tarefa

**What to build:** O usuário pede ao Candeia para "criar uma tarefa" e a tarefa é criada, e as respostas falam de tarefa. Os agentes de entidade passam a se chamar `task-create`, `task-edit`, `recurring-task-create` e `recurring-task-edit`, com instruções e esquemas de saída de tarefa; o roteador, o agente de consulta, o fallback e o explicador de falha falam de tarefa; o agente de consulta enxerga um esquema lógico com tabelas de tarefa. Os passos e jobs que já guardam os nomes antigos são reescritos, e a configuração publicada no banco ganha uma nova versão de fábrica sincronizada com o Hermes.

**Blocked by:** 04 (Banco da API renomeado no lugar), 06 (Contrato de tarefa)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md). Spec: "Banco da API" (dados reescritos), "API" (agentes e configuração) e a nota sobre dados fora das colunas. Glossário: Configuração do agente, Padrão de fábrica, Versão ativa e Sincronização com o Hermes.

- [ ] Os agentes de entidade e as instruções deles têm os nomes novos; nenhum id de agente nem origem de pedido (`voice-event` → `voice-task`) tem "event".
- [ ] As instruções de todos os agentes falam de tarefa, tarefa de referência, tarefa longa e tarefa recorrente, no feminino.
- [ ] O esquema lógico do agente de consulta tem tabelas e colunas de tarefa, e o SQL escrito com eles é reescrito para os nomes físicos certos.
- [ ] Uma migration reescreve o nome do agente interno nos dados dos passos e o tipo e o conteúdo dos jobs na fila que citam os nomes antigos; um teste de integração confere com linhas gravadas antes.
- [ ] A configuração dos agentes tem uma nova versão de fábrica com o texto novo, publicada como versão ativa, e a sincronização com o Hermes leva essa versão.
- [ ] Os testes dos workers de criação, edição e consulta passam com um pedido que cria, edita e consulta uma tarefa.
- [ ] Os testes de integração, `pnpm run test:unit` e `pnpm run typecheck` verdes; a área "agentes" sai da linha de base.
