# Serviço de autenticação (`apps/auth`) — estado e plano

Documento de continuação. Trabalho interrompido no meio; este arquivo tem o
suficiente para retomar do zero, sem a conversa.

Branch: `claude/apps-authentication-service-38406f` (worktree).

---

## 1. O que foi pedido

Um oitavo workspace, `apps/auth`, que **substitui inteiramente o Firebase Auth**:

- OAuth 2.0 com Google, Facebook e Microsoft;
- criação de usuário com senha própria do servidor;
- banco de dados próprio, apartado dos outros serviços;
- RBAC que define o que cada usuário pode criar, editar, ver e deletar —
  **incluindo** um usuário específico poder ver conteúdo específico de outro
  usuário específico;
- dupla verificação por WhatsApp ou SMS no login;
- JWT com tempo de expiração adequado;
- registro **só por convite**: um admin gera um link, e o usuário já nasce
  gravado com status de "ainda não logou" e com todo o RBAC montado;
- quem chega sem ser usuário nem convite pendente recebe **500 e nada no front**;
- todo fluxo passa pela autenticação antes de ir para qualquer serviço;
- depois de autenticado, o `userId` segue no header para o próximo serviço.

Mais duas perguntas, respondidas na seção 3:

- validar JWT em toda requisição deixa a aplicação lenta? qual a solução?
- o que mais é preciso para uma autenticação segura?

---

## 2. Decisões de arquitetura já fechadas

### Onde vive

Workspace `apps/auth`, NestJS, porta **3002**, bind em `127.0.0.1` (mesma
política do `apps/api`: quem fala com ele é o Next, na mesma máquina).

### Banco próprio

Postgres com Drizzle, conexão `AUTH_DATABASE_URL`, **sem nenhuma FK** com o
banco de eventos. Isso já estava decidido antes desta conversa — a memória do
projeto sobre a migração para Postgres diz literalmente "Sem tabela `users`.
`events.user_id` é `text` sem FK — a identidade e o cadastro vivem em um banco
separado da autenticação". O serviço de auth é o dono dessa tabela.

### Criptografia sem dependência nova

Tudo em `node:crypto`, nenhuma biblioteca de JWT ou de hash adicionada:

| Uso | Escolha | Por quê |
|---|---|---|
| Assinatura do JWT | **Ed25519 (`EdDSA`)** | assinatura de 64 bytes, verificação em dezenas de µs. Como cada serviço verifica localmente, o custo de verificação entra em *todo* request — é o número que importa. |
| Senha | **scrypt**, N=2^15, r=8 | Argon2id exigiria módulo nativo; scrypt é o memory-hard que já vem no runtime e mantém o build sem compilação C++. |
| Chave privada em repouso | **AES-256-GCM** com KEK do ambiente | dump do banco sozinho não forja token. |
| Código de 2FA | **HMAC-SHA256** com pimenta derivada da KEK (HKDF) | 6 dígitos com SHA-256 puro cairia numa tabela em segundos. |
| Refresh/convite/state | SHA-256 do segredo | 256 bits de entropia, não há dicionário; o hash existe para o dump não conter credencial usável. |

### Tokens

- **Access token**: JWT EdDSA, **15 minutos**. Como os outros serviços validam
  localmente, a expiração *é* a janela de revogação. 15 min mantém a janela
  curta e o tráfego de refresh baixo (~4 req/h por sessão).
- **Refresh token**: opaco, 256 bits, **30 dias**, guardado como hash,
  **rotativo a cada uso**, com **detecção de reuso** por família de sessão — se
  um refresh já rotacionado reaparece, a família inteira cai.
- **Convite**: 7 dias, uso único.
- **OTP**: 5 minutos, 6 dígitos, máximo 5 tentativas.
- **Token intermediário de MFA** (entre "senha ok" e "código ok"): 10 minutos,
  uso único, não dá acesso a nada.

Claims do access token: `iss`, `aud`, `sub`, `sid`, `jti`, `iat`, `exp`,
`perms`, `roles`, `amr`, `ver`.

`ver` é o `tokenVersion` do usuário — subir esse número invalida na hora todo
token já emitido. É o único caminho de revogação imediata.

### RBAC

Permissão é sempre a string `recurso:ação`. Recursos: `event`, `tag`, `user`,
`invite`, `role`, `grant`. Ações: `create`, `read`, `update`, `delete`,
`manage`. Único curinga aceito: `*:manage` (superadmin).

A linha que separa usuário comum de admin está no significado de `manage`:

- **CRUD vale sobre o próprio conteúdo** (e sobre o que foi concedido);
- **`manage` vale sobre o recurso inteiro, de qualquer dono**.

A ordem de decisão (`decideAccess`, em `src/rbac/access-policy.ts`) é:

1. sem a permissão base, nada mais é avaliado — **concessão amplia o alcance de
   um poder que o usuário já tem, não inventa poder**;
2. dono do conteúdo passa;
3. `recurso:manage` ou `*:manage` passa sobre qualquer dono;
4. concessão viva que case dono + recurso + ação passa, carregando o recorte;
5. o resto é negado.

`deny` explícito numa permissão direta ganha de qualquer `allow`, inclusive do
curinga de admin.

### A delegação (requisito "A vê conteúdo de B")

Tabela `access_grants`: `subject_user_id` (quem ganha), `owner_user_id` (de quem
é o conteúdo), `resource`, `actions[]`, `scope` jsonb (ids, tipos ou tags
específicos), `expires_at`, `revoked_at`, `granted_by`.

**Concessões não entram no JWT.** Permissões e papéis entram (são estáveis);
concessões são revogadas com frequência e precisam valer no mesmo instante,
enquanto um token já emitido sobrevive até expirar. Quem consulta é o serviço
dono do recurso, pela rota interna, com cache curto (30–60 s).

Para listagens existe `visibleOwners()`, que devolve `"all"` ou a lista de donos
visíveis — evita N+1 contra o auth.

### Entrada só por convite

Usuário nasce em `pending_invite`, criado pelo admin **junto com todo o RBAC**.
O aceite só preenche senha e telefone; nunca decide acesso.

Regra de resolução de identidade no OAuth:

1. identidade `(provider, provider_user_id)` conhecida → login;
2. senão, e-mail **verificado pelo provedor** casando com usuário ativo → liga a
   identidade e loga;
3. senão, convite pendente para aquele e-mail **com o token do convite em mãos**
   → aceite;
4. senão → `UnknownIdentityError`.

O Facebook nunca passa pelo passo 2: o Graph não diz se o e-mail foi confirmado,
então `emailVerified` é sempre `false` ali — criar uma conta no Facebook com o
e-mail de outra pessoa não pode virar tomada de conta.

### O 500 opaco

`UnknownIdentityError` → **500 com corpo vazio**, como pedido.

**Ressalva registrada:** 500 é semanticamente "o servidor quebrou". Ele vai
poluir o monitoramento (todo alerta de taxa de erro 5xx vai disparar com gente
batendo na porta) e impede distinguir "não convidado" de "banco fora do ar" no
próprio log — por isso o motivo real vai para a auditoria, com `detail`. A
alternativa que dá a mesma opacidade sem esse custo é 403 com corpo vazio.
Decisão do usuário; implementado como pedido, e isolado num único ponto
(`AuthExceptionFilter`) para trocar numa linha se ele mudar de ideia.

---

## 3. As duas perguntas

### "Passar por autenticação em toda requisição deixa lento? Dê uma solução"

Sim — **se** cada requisição virar uma chamada de rede ao serviço de auth. Isso
adicionaria um RTT a tudo (numa mesma máquina, ~1–3 ms; entre máquinas, 10 ms+),
e faria do auth um ponto único de falha: ele cair derruba a aplicação inteira,
mesmo que o resto esteja de pé.

**A solução é não perguntar.** O serviço de auth é o único que *emite* tokens,
com uma chave privada que nunca sai dele. Todos os outros serviços *verificam*
localmente, com a chave pública, buscada uma vez em
`/.well-known/jwks.json` e mantida em memória. Verificar uma assinatura Ed25519
custa dezenas de microssegundos e zero chamadas de rede.

Ou seja: o auth está no **caminho do login**, não no caminho de cada requisição.

O preço é que um token validado localmente não pode ser revogado no instante —
e é exatamente por isso que o access token dura 15 minutos, que o refresh é
rotativo e revogável no banco, e que existe o `ver`/`tokenVersion` para o caso
de precisar matar tudo agora.

Resumo do caminho de uma requisição:

```
browser → Next (/api/*) → Nest apps/api
                            └─ valida o JWT localmente (JWKS em cache)
                            └─ injeta x-user-id
                            └─ pergunta ao auth só as concessões, com cache curto
```

### "O que mais é preciso para uma autenticação segura?"

Já embutido no que foi escrito:

- PKCE + `state` + `nonce` em todo fluxo OAuth, com `state` de uso único no
  servidor;
- `appsecret_proof` no Facebook;
- validação de `iss`/`aud`/`exp`/`nonce` do `id_token`;
- algoritmo do JWT fixo em EdDSA, chave escolhida por `kid` dentro do nosso
  próprio conjunto (fecha o ataque do `alg: none` e a confusão de algoritmo);
- rotação de chave de assinatura sem deslogar ninguém (`active` → `retiring` →
  `retired`);
- resposta idêntica para "e-mail não existe" e "senha errada", **inclusive no
  tempo** (scrypt contra hash descartável quando não há usuário);
- limite de tentativas por e-mail (senha) e por usuário (envio de OTP);
- contador de tentativas do OTP incrementado **antes** da comparação;
- trilha de auditoria append-only, sem segredo dentro.

Ainda **falta decidir/fazer** (lista para a seção 5):

- cookies `httpOnly` + `Secure` + `SameSite=Lax` para o refresh, com `Path`
  restrito à rota de refresh;
- proteção de CSRF nas rotas que usam cookie (double-submit ou `SameSite=Strict`
  no refresh);
- cabeçalhos de segurança no Next (CSP, HSTS, `X-Frame-Options`);
- **impedir spoofing do `x-user-id`**: o header tem de ser removido na borda e
  escrito só pela camada que validou o token — hoje o Nest só escuta em
  loopback, o que ajuda, mas não basta como única defesa;
- expiração/limpeza das linhas mortas (`oauth_states`, `mfa_challenges`,
  sessões vencidas);
- alerta em cima de `token.reuse_detected` — é o sinal de token roubado;
- e-mail de aviso quando alguém entra de um dispositivo novo;
- validação de força de senha no aceite do convite;
- backup/recuperação: hoje, perder o telefone tranca o usuário para fora
  (precisa de códigos de recuperação ou de um caminho pelo admin).

---

## 4. O que já existe

`pnpm install` já rodou (adicionou `drizzle-orm`, `drizzle-kit`, `pg`,
`cookie-parser` e os tipos). `vitest.workspace.ts` já tem o projeto `auth`.

**47 testes passando** em `npx vitest run --project auth`.

### Configuração

- `apps/auth/package.json`, `tsconfig.json`, `tsconfig.build.json`,
  `nest-cli.json` — espelhados do `apps/api`.
- `src/config/env.ts` — schema zod de todas as variáveis do serviço, com o
  porquê de cada prazo no comentário.

### Cripto — **testado**

- `src/crypto/base64url.ts`
- `src/crypto/jwt.ts` + `jwt.test.ts` (9 testes) — assina/verifica JWS compacto
  EdDSA. Escrito à mão porque o único ponto perigoso do JWT é aceitar o `alg`
  que o token anuncia; aqui o algoritmo é fixo.
- `src/crypto/signing-key.ts` — gera par Ed25519, exporta JWK público.
- `src/crypto/key-encryption.ts` + `key-encryption.test.ts` (5 testes) —
  AES-256-GCM sobre a chave privada.
- `src/crypto/password.ts` + `password.test.ts` (5 testes) — scrypt.
- `src/crypto/secret-token.ts` — segredos opacos e código OTP.
- `src/crypto/otp-hash.ts` — HMAC com pimenta derivada da KEK.
- `src/crypto/signing-key.service.ts` — carrega/roda as chaves, assina, publica
  o JWKS, faz bootstrap da primeira chave.
- `src/crypto/ports/signing-key-repository.ts`

### RBAC — **testado**

- `src/rbac/permissions.ts` + `permissions.test.ts` (5 testes)
- `src/rbac/system-roles.ts` — `admin`, `member`, `viewer`
- `src/rbac/effective-permissions.ts` + teste (5 testes) — papéis + diretas,
  com `deny` ganhando
- `src/rbac/access-grant.ts` — a concessão e o casamento com um pedido
- `src/rbac/access-policy.ts` + `access-policy.test.ts` (18 testes) —
  `decideAccess` e `visibleOwners`. **É o coração do sistema.**
- `src/rbac/resolve-user-permissions.ts`
- `src/rbac/ports/rbac-repository.ts`

### Domínio e portas — sem teste ainda

- `src/users/user.ts` + `ports/user-repository.ts`
- `src/invites/invite.ts` + `ports/invite-repository.ts`
- `src/sessions/session.ts` + `ports/session-repository.ts`
- `src/mfa/mfa-challenge.ts` + `ports/mfa-challenge-repository.ts` +
  `ports/otp-delivery.gateway.ts`
- `src/oauth/oauth-state.ts` + `ports/oauth-state-repository.ts` +
  `ports/oauth-provider.ts`
- `src/login/login-attempt.ts` + `ports/login-attempt-repository.ts`
- `src/common/errors.ts`, `audit.ts`, `request-context.ts`, `rate-limiter.ts`

### Casos de uso — escritos, **sem teste ainda**

- `src/sessions/usecases/issue-session.usecase.ts`
- `src/sessions/usecases/refresh-session.usecase.ts` — rotação + detecção de reuso
- `src/sessions/usecases/revoke-session.usecase.ts`
- `src/login/usecases/login-with-password.usecase.ts`
- `src/mfa/usecases/send-mfa-code.usecase.ts`
- `src/mfa/usecases/verify-mfa-code.usecase.ts`

### OAuth — escrito, **sem teste ainda**

- `src/oauth/pkce.ts`
- `src/oauth/id-token.ts` — lê e valida `id_token` vindo direto do token
  endpoint por TLS (OIDC Core 3.1.3.7 dispensa verificar a assinatura nesse
  caminho; `iss`/`aud`/`exp`/`nonce` continuam obrigatórios)
- `src/oauth/providers/google.provider.ts`
- `src/oauth/providers/microsoft.provider.ts` — trata o `tid` variável do
  `common`
- `src/oauth/providers/facebook.provider.ts` — `appsecret_proof`, e-mail nunca
  verificado

### Entrega de OTP — escrito, **sem teste ainda**

- `src/mfa/gateways/console-otp.gateway.ts` (desenvolvimento)
- `src/mfa/gateways/twilio-otp.gateway.ts` (SMS + WhatsApp)
- `src/mfa/gateways/meta-whatsapp-otp.gateway.ts` (WhatsApp Cloud API)

---

## 5. O que falta

Em ordem de dependência.

### 5.1 Persistência (`src/db/`)

- `schema.ts` (Drizzle) com as tabelas:
  `users`, `identities`, `roles`, `role_permissions`, `user_roles`,
  `user_permissions`, `access_grants`, `invites`, `sessions`,
  `mfa_challenges`, `login_attempts`, `oauth_states`, `signing_keys`,
  `audit_log`.
- Migração inicial, incluindo o seed dos três papéis de sistema.
- `client.ts` (pool `pg`) e `db.module.ts` com os tokens de injeção, no mesmo
  formato de `packages/persistence/src/persistence.module.ts` (strings, não
  symbols, porque o Nest imprime o token na mensagem de erro).
- Um repositório Postgres por porta.
- `src/testing/in-memory-auth.repositories.ts` — dublês para os testes de
  usecase (o `apps/api` faz o equivalente em `src/events/testing/`).

### 5.2 Casos de uso restantes

- `invites/usecases/create-invite.usecase.ts` — cria o usuário
  `pending_invite` **com o RBAC montado** e devolve o link.
- `invites/usecases/accept-invite.usecase.ts` — senha + telefone, ativa,
  emite sessão.
- `invites/usecases/revoke-invite.usecase.ts`
- `oauth/usecases/start-oauth.usecase.ts` — PKCE, state, nonce, allowlist de
  `redirectTo`.
- `oauth/usecases/complete-oauth.usecase.ts` — a resolução de identidade da
  seção 2, incluindo o `UnknownIdentityError`.
- `rbac/usecases/update-user-access.usecase.ts`
- `rbac/usecases/create-access-grant.usecase.ts` / `revoke-access-grant.usecase.ts`
- `rbac/usecases/resolve-authorization.usecase.ts` — serve a rota interna.

### 5.3 Camada HTTP

Controllers (ordem das rotas importa no Nest — ver o aviso do `AGENTS.md` sobre
`events.controller.ts`):

- `POST /auth/login`, `POST /auth/mfa/send`, `POST /auth/mfa/verify`,
  `POST /auth/token/refresh`, `POST /auth/logout`, `GET /auth/me`
- `GET /auth/oauth/:provider/start`, `GET /auth/oauth/:provider/callback`
- `GET /auth/invites/:token`, `POST /auth/invites/:token/accept`
- `POST /auth/admin/invites`, `GET/PATCH /auth/admin/users/...`,
  `POST/DELETE /auth/admin/grants`
- `GET /.well-known/jwks.json`
- `GET /internal/access/:subjectUserId/visible-owners` e
  `POST /internal/authorize` — protegidas por `AUTH_INTERNAL_TOKEN`

Mais: `AuthExceptionFilter` (com a regra do 500 opaco), guard de JWT interno ao
próprio auth, guard de permissão, helpers de cookie, `app.module.ts` e
`main.ts`.

### 5.4 Integração com `apps/api`

- `JwtAuthGuard` novo: valida localmente com JWKS em cache (com refetch em
  `kid` desconhecido, e backoff para não virar amplificador).
- Injetar `x-user-id` — e **remover** esse header se ele vier de fora.
- Cliente das concessões, com cache curto, usado pelos usecases que hoje
  filtram por `userId`.
- `listByDay` e afins passam a respeitar `visibleOwners`.

### 5.5 Front

- `apps/web`: `rewrites` de `/auth/*` no `next.config.ts`; telas de login,
  2FA e aceite de convite; painel de admin de convites e concessões; trocar
  `useCurrentUser` do Firebase.
- `apps/mobile`: trocar `@react-native-google-signin` pelo fluxo OAuth do
  serviço (`expo-auth-session` + `expo-web-browser`), guardar o refresh em
  `expo-secure-store`.

### 5.6 Remoção do Firebase Auth

Só depois que o resto estiver de pé:

- `apps/api/src/auth/*` (guard, `verify-firebase-token`)
- `apps/web/src/lib/firebase/*`, `components/auth/GoogleSignInButton.tsx`
- `apps/mobile/src/lib/firebase/*`, `src/types/firebase-auth.d.ts`
- variáveis `NEXT_PUBLIC_FIREBASE_*`, `FIREBASE_*`, `MOBILE_GOOGLE_WEB_CLIENT_ID`

Atenção: `firebase-admin` continua sendo usado pelo Firestore em
`@repo/persistence` — a remoção aqui é só do **auth**.

### 5.7 Documentação

- `.env.example` com todas as chaves novas.
- Seção nova no `AGENTS.md` (o arquivo é a fonte de verdade do monorepo e hoje
  descreve sete workspaces, não oito).

---

## 6. Como retomar

```bash
npx vitest run --project auth
```

```bash
npm run --silent test:ai
```

```bash
pnpm --filter @repo/auth run typecheck
```

Cuidado conhecido do ambiente: heredoc do Git Bash no Windows quebra com
caracteres acentuados. O código do serviço está todo em ASCII, como o resto dos
comentários do repositório — vale manter.

---

## 7. Pendências de decisão

1. **500 vs 403** para identidade desconhecida (ver a ressalva na seção 2).
2. **Twilio ou Meta** como provedor do WhatsApp em produção — o Twilio cobre
   SMS e WhatsApp pela mesma API; o Meta é mais barato no volume, mas exige
   template aprovado e não faz SMS.
3. **Códigos de recuperação** de 2FA: sem eles, perder o telefone tranca o
   usuário para fora e só um admin resolve.
4. **Um Postgres com dois bancos, ou duas instâncias?** "Apartado" foi atendido
   como banco separado; instância separada é mais isolamento e mais custo.
5. Se o `apps/api` continua sendo o único consumidor, ou se já vale desenhar o
   contrato pensando em um terceiro serviço.
