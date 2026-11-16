# 04: Banco da API renomeado no lugar

**What to build:** O banco da API passa a ter nomes de tarefa sem perder dados. Uma migration escrita à mão renomeia tabelas, colunas, índices e checks, reescreve as chaves do template das séries e descarta as chaves de idempotência das rotas antigas. A API continua igual por fora: o esquema Drizzle aponta para os nomes físicos novos, e o SQL do agente de consulta continua funcionando porque o mapeamento dos nomes lógicos para os físicos é atualizado.

**Blocked by:** 03 (Varredura de resíduos com linha de base)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md). Spec: "Banco da API" e "Decisões de teste", costura 3. Skill do repositório `db-migrations`.

- [ ] As tabelas passam a ser `tasks`, `task_entries`, `task_tags`, `task_task_relation` e `task_artifact_relation`, renomeadas no lugar (sem drop/create).
- [ ] As colunas com o nome antigo passam a `from_task_id`, `to_task_id`, `task_id` (entradas, tags, relação com artefato e fila de jobs).
- [ ] Nenhum índice, chave, check ou unique fica com o prefixo ou o trecho `event`.
- [ ] As chaves do template da série com "event" (como `previousEventIds`) são reescritas para "task" nas linhas existentes.
- [ ] As chaves de idempotência guardadas são descartadas.
- [ ] O esquema Drizzle usa os nomes físicos novos, e o snapshot de metadados fica coerente: gerar uma migration logo depois não propõe mudança.
- [ ] A reescrita do SQL do agente mapeia para as tabelas e colunas físicas novas; os testes de integração do SQL do agente passam.
- [ ] Um teste de integração aplica as migrations até a anterior, grava tarefas, entradas, tags, sequência, relação com artefato, série com template e chave de idempotência, aplica a nova e confere que tudo está nos nomes novos, com o template reescrito e as chaves descartadas.
- [ ] Os testes de integração de persistência, `pnpm run test:unit` e `pnpm run typecheck` verdes; a área "banco" sai da linha de base da varredura.
