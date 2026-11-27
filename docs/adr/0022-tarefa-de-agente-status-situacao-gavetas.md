---
status: accepted
date: 2026-11-27
---

# Tarefa de agente: status próprios, situação, gavetas e gaveta de execução

Spec 51. Esta ADR junta as decisões da tarefa de agente na spec; cada ticket acrescenta a sua seção. A primeira é a
dos status de agente, que **substitui o item 3 da ADR 0011** no que diz respeito aos status de agente. Os tipos de
agente e o status de pessoa daquele item continuam valendo. Os projetos têm a ADR 0021.

## Status de agente

### Contexto

Uma tarefa de agente terminava `done` ou `cancel`, os mesmos nomes das tarefas de pessoa. Lendo só o status, não se
sabia quem terminou, e todo lugar que trata `done` precisava perguntar antes quem era o executor. Os seis estados da
execução também não distinguiam o pedido ainda em preparo do que já espera na fila, nem o que abre a sessão do que
trabalha, nem a execução que parou no meio da que falhou.

### Decisão

1. **O conjunto de agente tem dez status e nenhum é igual a um de pessoa:** `preparing`, `queued`, `starting`,
   `running`, `waiting`, `completed`, `interrupted`, `failed`, `cancelled` e `rolled_back`. Os de pessoa não mudam
   (`todo`, `toDefine`, `doing`, `inHold`, `done`, `cancel`, `missed`). O check `tasks_status_matches_actor` continua
   por executor, agora com os dois conjuntos sem valor em comum.
2. **Os grupos moram num lugar só por camada** e são o que as telas e a API perguntam, no lugar de listas soltas:
   - aberto: `preparing`, `queued`, `starting`, `running`, `waiting`;
   - em andamento: `preparing`, `queued`, `starting`, `running`;
   - final: `completed`, `interrupted`, `failed`, `cancelled`, `rolled_back`;
   - sucesso: `completed`.
   Estão em `apps/api/src/domain/agent-status.ts`, `packages/contracts/src/tasks/agent-status-groups.ts` (web) e
   `domain/task/AgentStatusGroups.kt` (Android). O MCP não depende dos contratos e guarda a sua cópia da lista no filtro
   de `list_tracked_tasks`.
3. **O passo usa o mesmo conjunto**, sem `waiting`. Os mapas entre status de passo e status de rastro seguem: `completed`
   vira `done`; `failed`, `cancelled`, `interrupted` e `rolled_back` viram `failed`; `preparing`, `queued` e `starting`
   viram `pending`. O status do job, o do rastro, o da geração de alimento e o da execução no Hermes não mudam: não são
   status de tarefa.
4. **Onde a API grava `done` e `cancel` de uma tarefa de agente, grava `completed` e `cancelled`.** Esta etapa só troca os
   nomes: os momentos em que a API grava um status não mudam, e `preparing`, `starting`, `interrupted` e `rolled_back`
   são aceitos e desenhados, mas ninguém os grava ainda.
5. **Uma migration** (`0010_status_de_agente_proprios`) tira o check, troca os valores nas tarefas de agente (pedidos e
   passos) e recoloca o check, tudo na mesma transação. As tarefas de pessoa não são tocadas. Os pedidos que já existem
   continuam na lista: os concluídos como "Concluído" e os cancelados como "Cancelado".
6. **Os contratos recusam o status de um executor no outro:** o esquema do cartão da tarefa rejeita um cartão de agente
   com `done` ou `cancel` e um de pessoa com status de agente.
7. **Os nomes na tela:** "Preparando", "Na fila", "Iniciando", "Trabalhando", "Esperando", "Concluído", "Interrompido",
   "Falhou", "Cancelado" e "Revertido"; o nome acessível é "Agente, " e o nome em minúscula ("Agente, concluído"). Um
   pedido `cancelled` mostra "Pedido cancelado" e um `interrupted` mostra "Pedido interrompido". Os ícones quadrados
   próprios vêm com a linha da tarefa de agente; até lá o glifo é o de hoje, reaproveitado.
8. **Lembretes, subtarefas e fração:** o lembrete de uma tarefa de agente se cala em qualquer status final e o de pessoa
   continua em `done` e `cancel`; a subtarefa de agente fechada é a de status final; a fração conta `done` de pessoa e
   `completed` de agente.

### Alternativas rejeitadas

- Manter `done` e `cancel` nos dois conjuntos e distinguir pelo `actor`: todo lugar continuaria precisando perguntar o
  executor.
- Renomear também o status do job e o do rastro: não são status de tarefa e outros consumidores os leem.

### Consequências

- O app Android precisa ser publicado junto com a API. O app antigo falhava ao ler um status que não conhecia; o novo lê
  um status desconhecido como neutro, sem derrubar o cartão.
- Quem entrar depois com um status de agente novo (como `awaiting_transcription`, das issues 39 e 40) decide entre usar
  `queued` e acrescentá-lo ao conjunto e aos grupos, com nome, ícone e cor.
