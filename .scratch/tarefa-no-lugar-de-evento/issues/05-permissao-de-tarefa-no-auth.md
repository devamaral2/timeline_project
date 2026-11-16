# 05: Permissão de tarefa no Auth

**What to build:** O controle de acesso passa a falar de tarefa. Quem tinha `event:read`, `event:create`, `event:update` ou `event:delete` passa a ter a permissão `task:` equivalente, sem perder acesso, e o banco do Auth deixa de aceitar `event:*`. O gateway passa a decidir pelo recurso `task` (ainda sobre o caminho atual da API, que muda no ticket 07).

**Blocked by:** 03 (Varredura de resíduos com linha de base)

**Status:** done

**Leia antes:** o [README](README.md). Spec: "Banco do Auth" e "Decisões de teste", costuras 3 e 4.

- [x] Uma migration do Auth reescreve as permissões de papel e de usuário de `event:<ação>` para `task:<ação>` e troca os checks de formato para aceitar `task` e recusar `event`, seguindo a convenção do Auth, com o arquivo de reversão.
- [x] Os recursos de acesso são `task`, `tag`, `artifact`, `recurrence` e `agent`; `event` não existe mais no Auth.
- [x] A política do gateway devolve o recurso `task` para as rotas de tarefas.
- [x] Um teste de integração grava permissões `event:*` concedidas, aplica a migration e confere que viraram `task:*`, e que gravar `event:read` passa a falhar.
- [x] Os testes de autorização e da política do gateway usam `task`.
- [x] Os testes do Auth, `pnpm run test:unit` e `pnpm run typecheck` verdes; a área "auth" (exceto o caminho da rota) sai da linha de base.
