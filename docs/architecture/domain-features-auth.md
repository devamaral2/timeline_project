# Domínio, features e autorização

## Fronteiras

```
packages/contracts/src/          tipos do contrato HTTP compartilhados
apps/api/src/domain/             entidades, regras de negócio e portas
apps/api/src/features/           capacidades HTTP e de aplicação
apps/api/src/infrastructure/     Postgres, schema Drizzle e adaptadores
apps/auth/src/domain/            usuario, convite, sessao e vocabulario RBAC
apps/auth/src/features/          login, convite, sessao, JWT e autorizacao
```

`domain` não importa Nest, HTTP, Postgres nem um diretório de `features`.
As features usam o domínio por suas portas; a infraestrutura implementa as
portas. Web, mobile e timeline só recebem os tipos de `@repo/contracts`.
Uma alteração funcional deve caber preferencialmente no diretório da feature
afetada, incluindo controller, use case, serviço e testes. Os grupos atuais
(`events`, `tasks`, `recurrences`, `agent`) mantêm seus módulos Nest juntos;
quando uma capacidade ganhar autonomia real, ela pode virar um subdiretório
sem mover entidades para fora do domínio.
Na API, `authenticate-user` contém a identidade e o cliente do auth;
`authorize-user` contém o guard HTTP e a declaração do recurso. Eles não
implementam RBAC localmente: a decisão sempre vem do `apps/auth`.

## Identidade e acesso

`apps/auth` é o único dono de login por senha, sessão, JWT e RBAC. A API não
descriptografa nem interpreta JWT: entrega o bearer ao serviço de auth. Cada
controller da API declara seu recurso com `@AccessResource`; o guard traduz o
verbo HTTP em ação e pede uma decisão a `/auth/internal/authorize`. O auth
reconsulta usuário, sessão e grants no banco, aplica o papel e devolve só a
identidade autorizada. Falha do auth ou ausência da chave interna fecha o
acesso (503), não libera a requisição. Uma rota protegida sem `@AccessResource`
também falha fechada, para que um controller novo não esqueça a política.

O WebSocket do agente recebe um ticket único emitido após a autorização HTTP.
O ticket contém apenas `userId`, `sessionId` e o dono-alvo; o auth revalida a
permissão no upgrade e antes de cada mensagem. Nenhuma permissão JWT fica
congelada no ticket.

No auth, `basic-login` possui o controller de senha e a verificação de
credenciais; `invite-user` contém as rotas públicas de convite e a única rota
administrativa; `manage-session` trata refresh e encerramento; `authenticate-user`
verifica/assina JWT; `authorize-access` contém a política RBAC e os endpoints
internos de decisão. Modelos de usuário, convite e sessão ficam em `domain`.

O catálogo granular atual cobre `event` e `tag`; `task`, `note`, `recurrence`
e `agent` usam leitura para viewer e escrita para member/admin. Um viewer não
escreve mesmo que receba um grant direto de escrita em event/tag. Ações sobre
outro usuário exigem superadmin ou `manage` do recurso pertinente. O banco da
API ainda usa `userId` nas consultas e mutações para evitar vazamento por ID
e corridas entre a decisão de acesso e a gravação; isso é isolamento de dados,
não uma interpretação de papéis ou permissões.

## Rotas de administração

A única rota de administração exposta é `POST /auth/admin/invites`. Ela mantém
papéis e permissões diretas no convite, sem antecipar uma futura estratégia de
gestão de usuários. As rotas removidas não devem ser recriadas sem contrato
OpenAPI, caso de uso e decisão de produto explícitos.

## Operação

API e auth devem receber o mesmo `AUTH_INTERNAL_SERVICE_KEY` secreto (mínimo
de 32 caracteres) pelo ambiente. Não o exponha ao browser ou ao mobile.
O catálogo executável do auth fica em `/docs`, e o JSON em `/openapi.json`, no
host/porta do `apps/auth` (porta local padrão 3002).
