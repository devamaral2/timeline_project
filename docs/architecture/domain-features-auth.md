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
Na API, `request-identity` contém apenas a identidade já autorizada pelo
gateway. Não existe cliente HTTP para o auth nem decisão de RBAC na API.

## Identidade e acesso

`apps/auth` é o único dono de login por senha, sessão, JWT e RBAC. O gateway
recebe `/api/*`, valida o bearer, reconsulta usuário, sessão e grants no banco,
e só então encaminha a requisição para a API com uma identidade interna e a
chave de gateway. A API apenas verifica essa fronteira e usa o `userId` para
isolar os dados; nunca chama o auth.

O WebSocket do agente recebe um ticket único emitido após a autorização HTTP.
O ticket contém apenas `userId`, `sessionId` e o dono-alvo; como a emissão já
passou pelo gateway, a API consome o ticket sem callback para o auth.

No auth, `basic-login` possui o controller de senha e a verificação de
credenciais; `invite-user` contém as rotas públicas de convite e a única rota
administrativa; `manage-session` trata refresh e encerramento; `authenticate-user`
verifica/assina JWT; `authorize-access` contém a política RBAC usada pelo
gateway. Modelos de usuário, convite e sessão ficam em `domain`.

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
