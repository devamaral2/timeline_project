# 01: Gateway libera artefatos e pedidos

**What to build:** Uma chamada autenticada a `/api/artifacts` ou a `/api/requests` atravessa o gateway do Auth e chega à API com a chave interna e o usuário. As rotas de tarefas e de notas, que não existem mais na API, deixam de ter política.

**Blocked by:** None (can start immediately)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: “Gateway do Auth” e “Decisões de teste” (costura 2).

- [x] Um caminho que começa com `/api/artifacts` resolve para o recurso `artifact`, com a ação conforme o método (ler, criar, editar, apagar).
- [x] Um caminho que começa com `/api/requests` resolve para o recurso `agent`: `POST` é `execute` e `GET` é `read`, como em `/api/ai`.
- [x] O conjunto de recursos de acesso tem `artifact` e não tem mais `task` nem `note`.
- [x] As regras por papel não mudam: leitor só lê, membro e administrador escrevem.
- [x] A conferência do `userId` do corpo, que já vale para o recurso `agent`, vale para as rotas de pedidos.
- [x] `/api/tasks` e `/api/notes` são recusados como rota sem política.
- [x] O teste da política de rotas cobre os casos novos e os removidos, e os testes do Auth passam.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
