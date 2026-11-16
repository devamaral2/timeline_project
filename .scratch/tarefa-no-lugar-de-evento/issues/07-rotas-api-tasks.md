# 07: Rotas /api/tasks

**What to build:** As tarefas passam a morar em `/api/tasks` de ponta a ponta. A API responde em `GET /api/tasks`, `GET /api/tasks/tracked`, `GET /api/tasks/:taskId`, `POST /api/tasks`, `PATCH /api/tasks/:taskId` e `DELETE /api/tasks/:taskId`, e `/api/events` responde como rota inexistente. O gateway do Auth aplica a permissão de tarefa pelo caminho novo, o web chama as rotas novas e o MCP expõe `create_task`, `update_task`, `get_task`, `list_agenda_tasks` e `list_tracked_tasks`, sem as ferramentas antigas.

**Blocked by:** 05 (Permissão de tarefa no Auth), 06 (Contrato de tarefa)

**Status:** done

**Leia antes:** o [README](README.md). Spec: "API" (rotas e OpenAPI), "MCP" e "Decisões de teste", costuras 2, 4 e 5.

- [x] Os controllers respondem só nas rotas `/api/tasks`; qualquer chamada em `/api/events` devolve não encontrado.
- [x] A documentação OpenAPI usa tags, operações, parâmetros (`taskId`) e descrições de tarefa; o teste do catálogo confere que nenhuma rota `/api/events` existe.
- [x] A política do gateway mapeia `/api/tasks` para o recurso `task` e recusa `/api/events`; o teste da política cobre os dois.
- [x] O cliente da API do web e a API falsa usam só `/api/tasks`.
- [x] O MCP expõe `create_task`, `update_task`, `get_task`, `list_agenda_tasks` e `list_tracked_tasks`, com descrições e parâmetros de tarefa; `create_event`, `update_event`, `get_event`, `list_timeline_events` e `list_tracked_events` não existem; o teste do MCP confere a lista e a rota que cada ferramenta chama.
- [x] As skills do Hermes que citam as ferramentas antigas passam a citar as novas.
- [x] `pnpm run test:unit` e `pnpm run typecheck` verdes; as áreas "rotas", "gateway" e "mcp" saem da linha de base.
