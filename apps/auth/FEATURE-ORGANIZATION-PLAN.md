# Nova organização de features em `apps/auth`

## Resumo

Reorganizar somente a estrutura interna de `apps/auth`, preservando:

- todas as rotas atuais;
- payloads e respostas HTTP;
- regras de autenticação, autorização e sessão;
- banco e migrations;
- comportamento do proxy `/api/*`.

Cada operação HTTP será uma feature independente, com seu próprio controller e caso de uso.

## Organização proposta

```text
src/features/
  login-with-password/
    login-with-password.module.ts
    http/login-with-password.controller.ts
    usecases/login-with-password.usecase.ts
    services/login-credential-checker.ts
    services/rate-limit/
    postgres-login.repository.ts

  refresh-token/
    refresh-token.module.ts
    http/refresh-token.controller.ts
    usecases/refresh-token.usecase.ts

  logout/
    logout.module.ts
    http/logout.controller.ts
    usecases/logout.usecase.ts

  logout-all/
    logout-all.module.ts
    http/logout-all.controller.ts
    usecases/logout-all.usecase.ts

  current-user/
    current-user.module.ts
    http/current-user.controller.ts
    usecases/current-user.usecase.ts

  inspect-invite/
    inspect-invite.module.ts
    http/inspect-invite.controller.ts
    usecases/inspect-invite.usecase.ts

  accept-invite/
    accept-invite.module.ts
    http/accept-invite.controller.ts
    usecases/accept-invite.usecase.ts

  create-invite/
    create-invite.module.ts
    http/create-invite.controller.ts
    usecases/create-invite.usecase.ts

  bootstrap-admin/
    bootstrap-admin.usecase.ts
```

Cada controller terá apenas a rota da sua feature. Controllers diferentes poderão continuar usando `@Controller("auth")`.

Mapeamento:

| Feature | Rota |
|---|---|
| `login-with-password` | `POST /auth/login` |
| `refresh-token` | `POST /auth/token/refresh` |
| `logout` | `POST /auth/logout` |
| `logout-all` | `POST /auth/logout-all` |
| `current-user` | `GET /auth/me` |
| `inspect-invite` | `POST /auth/invites/inspect` |
| `accept-invite` | `POST /auth/invites/accept` |
| `create-invite` | `POST /auth/admin/invites` |

## Código compartilhado

Remover as falsas features `gateway` e `user-lookup`.

Criar uma área compartilhada restrita a componentes usados por mais de uma feature:

```text
src/auth-core/
  auth-core.module.ts
  persistence/
    postgres-user.repository.ts
    postgres-session.repository.ts
    postgres-invite.repository.ts
    postgres-rbac.repository.ts
  password/
    prepare-password.ts
    password-policy.ts
    scrypt-password-hasher.ts
    http-pwned-passwords.gateway.ts
  security/
    jwt.ts
    signing-key.service.ts
    postgres-signing-key.repository.ts
    bearer-auth.guard.ts
    current-actor.decorator.ts
    authorization.service.ts
    require-super-admin.guard.ts
```

- Repositórios concretos compartilhados serão injetados diretamente.
- Remover `ports/*repository.ts`.
- Manter interfaces apenas para dependências externas ou substituições realmente necessárias, como gateway de senhas comprometidas.
- Repositórios exclusivos de uma feature permanecerão dentro dela, como o repositório específico do login.
- O `ApiGatewayController` e o proxy WebSocket sairão de `features` e irão para `src/http/api-proxy/`, pois são adaptadores de transporte, não features de negócio.
- JWKS e health continuarão em `src/http`.
- `domain`, `common`, `config`, `db` e `audit` continuarão como áreas transversais.

## Wiring do Nest

Criar um `AuthCoreModule.forRoot(env)` para registrar:

- banco;
- configurações;
- relógio e gerador de segredo;
- segurança JWT;
- repositórios compartilhados;
- serviços de senha.

Cada feature terá seu próprio `*.module.ts`, responsável por registrar seu controller, caso de uso e dependências exclusivas. O `AppModule` ficará apenas como composição dos módulos.

Os nomes internos poderão ser ajustados para refletir a feature (`LoginWithPasswordUseCase`, `RefreshTokenUseCase`, `CurrentUserUseCase` etc.), sem alterar o contrato externo.

## Testes e validação

- Atualizar imports e testes para os novos caminhos.
- Preservar testes unitários e de integração existentes.
- Adicionar verificações de roteamento garantindo que cada endpoint continua respondendo pela feature correta.
- Validar `/api/*`, WebSocket, JWKS e guards após remover `gateway` e `authenticate-user` como features.
- Adicionar teste arquitetural garantindo:
  - nenhuma pasta `features/user-lookup`, `features/gateway` ou `features/manage-session`;
  - nenhum port de repositório;
  - cada feature HTTP possui um único controller da operação correspondente.
- Executar typecheck, build e suíte de testes do Auth.
- Não criar migration nem alterar tabelas.

## Assumptions

- `apps/auth/PLANO.md` não será consultado nem alterado.
- A mudança é estrutural; nenhuma regra de negócio será modificada.
- O proxy continuará sendo responsabilidade do Auth, apenas fora de `features`.
- Código de manutenção e CLI continuará fora das features HTTP, usando os serviços compartilhados necessários.
