# 12: Fechamento e validação na worktree

**What to build:** A troca termina sem resíduo e é validada no fluxo real. A linha de base da varredura fica vazia e o teste passa a exigir zero resíduos; `docs/mobile-parity.md` registra a troca na exceção do banco novo; e uma worktree provisionada do zero mostra que dá para criar, ver, editar e excluir uma tarefa pela tela e pedir ao agente que crie uma tarefa.

**Blocked by:** 02 (Glossário, ADR 0015 e instruções), 08 (Código interno da API com nome de tarefa), 09 (Agentes falam de tarefa), 11 (Telas e endereços de tarefa no web)

**Status:** done

**Leia antes:** o [README](README.md). Spec: "Decisões de teste" (validação final) e "Fora de escopo" (Android). AGENTS.md (criação de worktree) e a skill `worktree-app-testing`.

- [x] A linha de base da varredura está vazia e foi removida; o teste falha com qualquer resíduo fora da lista de exceções.
- [x] `docs/mobile-parity.md` registra, na exceção do banco novo, que a entidade passou a se chamar tarefa e que o Android troca o nome no seu porte.
- [x] Uma worktree criada com `pnpm worktree:new` sobe com as migrations novas em bancos vazios.
- [x] Na worktree, pela tela: criar, ver, editar e excluir uma tarefa funcionam em `/tarefas/...`, com os textos novos, e `/eventos/...` não abre.
- [x] Na worktree: um pedido ao agente "crie uma tarefa …" cria a tarefa e a resposta fala de tarefa.
- [x] `pnpm run test:unit`, `pnpm run typecheck`, os testes de integração e os e2e verdes.
