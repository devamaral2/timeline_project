# Serviço de autenticação — Etapa 1

**Status:** desenho consolidado para revisão em 31 de agosto de 2026

**Documento de origem:** `apps/auth/PLANO.md`

## Objetivo

Entregar um serviço NestJS executável em `apps/auth` que permita iniciar um
banco vazio, criar o primeiro administrador e executar de ponta a ponta o
fluxo convite → senha → telefone → MFA → códigos de recuperação → sessão →
refresh/logout.

Esta etapa substitui as decisões contraditórias já identificadas no documento
de origem. Em particular, MFA é obrigatório, falhas de autenticação usam uma
resposta uniforme e access tokens não prometem revogação antes do próprio TTL.

Este documento é a fonte normativa para a etapa 1. Quando ele divergir do
`apps/auth/PLANO.md`, prevalece para esta etapa; o documento de origem continua
registrando a visão das etapas posteriores. As substituições intencionais estão
enumeradas ao final para que a implementação não combine contratos incompatíveis.

## Escopo

### Incluído

- workspace NestJS `@repo/auth`, porta 3002 e bind padrão em `127.0.0.1`;
- Postgres com Drizzle em banco lógico exclusivo da autenticação;
- papéis e permissões diretas atribuídos no convite e emitidos nos tokens;
- bootstrap do primeiro administrador por CLI;
- criação e aceite de convites;
- senha própria com política moderna e `scrypt`;
- MFA obrigatório por SMS ou WhatsApp usando Twilio Verify;
- 10 códigos de recuperação por usuário;
- sessões com access token JWT EdDSA e refresh token opaco rotativo;
- logout de uma sessão e revogação de todas as sessões;
- JWKS e rotação de chaves;
- rate limiting persistente e auditoria append-only;
- health checks, limpeza de dados transitórios, documentação e testes.

### Excluído

- OAuth com Google, Facebook e Microsoft, que forma a etapa 2;
- grants de conteúdo entre usuários e integração de autorização com `apps/api`,
  que formam a etapa 3;
- cookies, BFF e telas web, que formam a etapa 4;
- cliente mobile, ingresso público do auth e remoção do Firebase Auth, que
  formam a etapa 5.

Nenhuma dessas exclusões será antecipada por abstrações sem consumidor. O
schema inicial, por exemplo, não terá `identities`, `oauth_states` nem
`access_grants`.

## Decisões aprovadas

- Não existe `mfaEnabled`. Todo usuário ativo usa MFA, inclusive administradores.
- O primeiro administrador nasce como `pending_invite` por um comando CLI e
  aceita o convite como qualquer outra pessoa.
- Toda falha de autenticação responde `401` com corpo vazio. `403` é exclusivo
  para usuário autenticado sem autorização.
- Access tokens duram 15 minutos e continuam válidos até `exp`. Logout,
  suspensão e troca de senha cortam refresh tokens, mas não fazem introspecção
  dos access tokens já emitidos.
- Não existem `tokenVersion` nem claim `ver`.
- Cada usuário recebe 10 códigos de recuperação de uso único.
- Auth usa o mesmo cluster Postgres operado pelo projeto, porém com banco e
  credencial exclusivos, sem FK ou consulta cruzada com os eventos.
- Twilio Verify é o provedor inicial de SMS e WhatsApp. Meta direto não entra
  nesta etapa.
- Senhas têm de 12 a 128 caracteres Unicode, sem regras de composição e sem
  troca periódica. Senhas comuns ou vazadas são recusadas.
- A implementação avança por fatias verticais completas, e não por todas as
  tabelas, depois todos os repositórios e depois todos os controllers.

## Arquitetura

`apps/auth` é dono de seu domínio, persistência e transporte. Nenhum outro
workspace importa arquivos internos do serviço. Os únicos contratos externos
são HTTP e JWKS.

```text
CLI / futuro BFF / futuro mobile
                |
                v
       apps/auth (NestJS :3002)
          |              |
          v              v
  Postgres de auth   Twilio Verify / Pwned Passwords
```

O bind de loopback é suficiente para esta etapa e para o futuro BFF. A forma de
expor o serviço ao mobile será desenhada somente na etapa 5.

O workspace será dividido por responsabilidade:

- `db`: pool, schema, migrações e transações;
- `users`: usuário, estado e operações administrativas;
- `rbac`: papéis, permissões diretas e resolução efetiva;
- `invites`: bootstrap, emissão, inspeção e aceite;
- `credentials`: política, blocklist e hash de senha;
- `mfa`: Twilio Verify, desafios e códigos de recuperação;
- `sessions`: emissão, refresh e revogação;
- `crypto`: JWT, Ed25519, criptografia da chave privada e JWKS;
- `audit`: eventos append-only;
- `http`: controllers, guards, validação, contexto e filtro de exceções.

Portas de persistência expressam transições atômicas do negócio. Operações como
`completeInviteEnrollment` e `rotateRefreshToken` não serão montadas por uma
sequência pública de `find()` e `save()` que permita estados intermediários.

## Modelo de dados

Todas as chaves de domínio são ULIDs representados como `text`. Datas são
`timestamptz`. E-mails são gravados já normalizados com `trim().toLowerCase()`
e possuem índice único.

### `users`

Guarda e-mail, nome, `password_hash`, telefone E.164, `phone_verified_at`, canal
MFA (`sms` ou `whatsapp`), status (`pending_invite`, `active`, `suspended` ou
`disabled`) e timestamps. Não contém `mfa_enabled` nem `token_version`.

As transições permitidas são `pending_invite → active`, `active ↔ suspended` e
qualquer estado não terminal → `disabled`. `disabled` é terminal pela API;
qualquer saída de `active` revoga todas as sessões.

Um usuário só pode virar `active` quando `password_hash`, telefone, canal e
verificação do telefone estiverem preenchidos; a constraint do banco e o caso
de uso aplicam a mesma regra. Se uma identidade exclusivamente OAuth dispensar
senha no futuro, a etapa 2 fará uma migração explícita em vez de enfraquecer a
invariante atual por antecipação.

### RBAC

- `roles`: chave estável, nome, descrição e `is_system`;
- `role_permissions`: relação única entre papel e permissão;
- `user_roles`: relação única entre usuário e papel;
- `user_permissions`: uma entrada por usuário e permissão, com efeito `allow`
  ou `deny`.

A permissão segue `recurso:ação`. O catálogo fechado usa os recursos `event`,
`tag`, `user`, `invite`, `role` e `grant`; as ações `create`, `read`,
`update`, `delete` e `manage`; e o único curinga `*:manage`.

A migração inicial cria exatamente estes papéis de sistema:

- `admin`: `*:manage`;
- `member`: `event:create`, `event:read`, `event:update`,
  `event:delete`, `tag:create` e `tag:read`;
- `viewer`: `event:read` e `tag:read`.

Uma negação direta da ação específica é avaliada antes de um allow amplo. Assim,
`deny event:delete` vence `event:manage` e `*:manage`. O conjunto resolvido
mantém allows e denies separados; não descarta a informação necessária para o
serviço consumidor tomar essa decisão.

Alterar acesso afeta tokens emitidos depois da mudança. Tokens anteriores
conservam seus claims por até 15 minutos, a mesma janela de revogação já
aprovada para suspensão e logout.

Um administrador capaz é um usuário `active` cuja resolução efetiva ainda cobre
`*:manage`. Toda mudança de status ou acesso que possa retirar essa capacidade
usa um advisory lock transacional e é recusada com `409` se deixaria zero
administradores capazes. O teste é feito sobre o resultado efetivo, inclusive
denies diretos, para impedir lockout por duas alterações concorrentes.

### `invites`

Guarda somente o hash SHA-256 do token de 256 bits, usuário, emissor opcional
(`null` no bootstrap), expiração, aceite, revogação e timestamps. O convite
dura sete dias e vale uma vez. Ao reemitir um convite, a transação bloqueia o
usuário e revoga qualquer convite ainda pendente antes de inserir o novo.

### `authentication_attempts`

Representa o estado entre o primeiro fator e o segundo. Guarda hash SHA-256 de
um token intermediário com 256 bits de entropia, usuário, propósito
(`invite_acceptance`, `login`,
`password_change` ou `recovery_regeneration`), método de segundo fator
escolhido (`otp` ou `recovery`), métodos do primeiro fator, `invite_id` ou
`origin_session_id` quando aplicável, `verified_at`, expiração, consumo e
timestamps.

Para `invite_acceptance`, a tentativa também guarda `proposed_password_hash`,
`proposed_phone_e164` e `proposed_mfa_channel`. Esses valores não são escritos
no usuário antes da aprovação do desafio vinculado àquela mesma tentativa.
Constraints por propósito recusam combinações incoerentes. O token intermediário
dura dez minutos, vale uma vez e não autoriza nenhuma rota fora de MFA ou da
ação de step-up explicitamente nomeada.

### `mfa_challenges`

Liga uma tentativa local a uma verificação do Twilio. Guarda canal solicitado,
canal reportado pelo provedor, identificador do provedor, contagem local de
checks, expiração, consumo e timestamps. O código é gerado e validado pelo
Twilio Verify; não existe `code_hash` local. O serviço do Twilio será
configurado para código de seis dígitos, validade de cinco minutos e no máximo
cinco checks. A contagem local é incrementada atomicamente antes de cada chamada
de verificação.

### `sessions` e `refresh_tokens`

Uma linha em `sessions` representa um aparelho lógico e fornece o `sid` estável
do access token. Guarda usuário, contexto inicial, último uso, revogação e
timestamps. Também preserva os métodos e o instante da autenticação original.
Refresh mantém esse `amr` e esse instante; ele não transforma a sessão em uma
autenticação feita apenas com `refresh`.

Cada rotação insere uma linha em `refresh_tokens`, que guarda somente hash
SHA-256 de um segredo com 256 bits de entropia, sessão, expiração, consumo e
sucessor. Cada token dura 30 dias a partir da emissão. A sessão continua enquanto
tokens forem renovados e não houver revogação; hashes consumidos são mantidos
durante a vida da sessão para detectar reuso.

Cada nova emissão, inclusive refresh, relê status, papéis e permissões do
usuário. Usuário fora de `active` não recebe token novo; mudanças de acesso
aparecem no próximo access token sem alterar o que já foi emitido.

### `recovery_codes`

Cada geração contém 10 códigos independentes de 80 bits, codificados em Base32
e exibidos como `XXXX-XXXX-XXXX-XXXX`. O banco guarda SHA-256, geração,
`used_at`, `revoked_at` e timestamps. Um novo conjunto revoga todos os códigos
anteriores na mesma transação.

### `signing_keys`

Guarda `kid`, status (`active`, `retiring`, `retired`), JWK pública, chave
privada cifrada, criação, último uso para assinatura, `retire_after` e retirada.
Um índice parcial garante no máximo uma chave ativa; bootstrap e rotação usam
uma transação com lock para também garantir pelo menos uma ao final da operação.
Ao aposentar a chave, a aplicação apaga o material privado cifrado e conserva a
JWK pública para auditoria.

No startup, o serviço carrega a chave ativa e cria a primeira sob o mesmo lock
transacional se o banco ainda não tiver nenhuma. A rotação operacional usa
`pnpm --filter @repo/auth run rotate-signing-key`; ela promove uma chave nova e
marca a anterior como `retiring` atomicamente. A rotina de retenção só a
aposenta depois de `retire_after`.

Cada emissão bloqueia para leitura a linha ativa dentro da transação, registra
seu uso e assina com o material privado mantido em cache por `kid`. A rotação
obtém o lock incompatível antes da promoção; assim, nenhuma réplica continua
assinando com a chave antiga depois do commit. O runbook agenda rotação a cada
30 dias e também permite execução manual antecipada.

### `rate_limit_buckets`

Contadores persistentes usam chave HMAC, início de janela, quantidade e
`blocked_until`. Uma chave distinta é derivada da KEK por HKDF com o contexto
`timeline-auth-rate-limit`; e-mail e IP não são gravados em claro. Os limites
padrão são:

- senha: 5 tentativas por e-mail em 15 minutos;
- senha: 30 tentativas por IP em 15 minutos;
- início ou reenvio de MFA: 3 por usuário em 10 minutos;
- verificação de OTP ou recovery code: 5 por tentativa.

Twilio aplica seus limites e mecanismos antifraude adicionalmente.

### `audit_log`

Registra id, correlação, ator, ação, alvo, resultado, motivo interno, metadata,
IP, user-agent e data. O usuário de runtime recebe apenas `INSERT` nessa tabela;
migrações usam uma credencial separada. Updates e deletes também são recusados
por trigger.

Produção usa `AUTH_DATABASE_URL` para o papel restrito de runtime e
`AUTH_DATABASE_MIGRATION_URL` para migrações. Em desenvolvimento, os dois
valores podem apontar para a mesma credencial.

## Fluxos

### Bootstrap do primeiro administrador

```text
pnpm --filter @repo/auth run bootstrap-admin -- \
  --email admin@dominio.com --name "Administrador"
```

O comando valida que ainda não existe usuário com papel `admin`, cria usuário
`pending_invite`, papel e convite em uma transação e imprime o link uma única
vez. Se o processo falhar depois do commit e antes de o operador preservar o
link, uma nova execução com o mesmo e-mail normalizado do único administrador
ainda pendente revoga o convite anterior e emite outro. E-mail diferente ou
mais de um administrador fazem o comando recusar a operação; ele também recusa
quando já existe um administrador fora desse estado inicial recuperável. O link
usa fragmento,
`<AUTH_WEB_APP_URL>/convites/aceitar#token=<segredo>`, para o token não entrar
automaticamente em logs HTTP ou no header `Referer`.

### Convite administrativo

Um admin envia e-mail, nome, papéis e permissões diretas. A transação valida o
catálogo de permissões, recusa e-mail já pertencente a outro usuário, cria o
usuário pendente com todo o RBAC e emite o convite. A resposta devolve o link
secreto e o id do usuário uma única vez; a entrega ao destinatário é
responsabilidade do admin. Não há gateway de e-mail na etapa 1. O aceite nunca
escolhe ou altera acesso.

Para um usuário ainda `pending_invite`, o admin pode reemitir ou revogar o
convite. Reemitir bloqueia o usuário, revoga todos os convites e tentativas
anteriores, preserva o RBAC e devolve um único link novo. Isso recupera link
perdido ou convite expirado sem criar outra conta.

### Aceite do convite

1. O cliente envia o token no corpo, nunca na URL da API.
2. O serviço valida uso, expiração e revogação.
3. A senha passa pela política e pela blocklist antes do `scrypt`.
4. Telefone e canal são normalizados.
5. Hash da senha, telefone e canal propostos ficam vinculados à nova tentativa;
   o usuário continua inalterado e pendente.
6. São criados uma tentativa opaca e um desafio Twilio ligado a ela.
7. A resposta contém apenas token MFA, canal, destino mascarado e expiração.
8. Após um check aprovado pelo Twilio, uma transação bloqueia tentativa,
   desafio, convite e usuário; confere os vínculos, copia para o usuário os dados
   daquela tentativa, consome os três primeiros, invalida outras tentativas do
   convite, ativa o usuário, cria os recovery codes e a primeira sessão.
9. A resposta mostra os 10 códigos uma única vez junto dos tokens da sessão.

Uma queda depois da aprovação externa e antes do commit local não ativa o
usuário. Como convite e tentativa continuam pendentes, o cliente pode iniciar
um novo desafio com o mesmo convite; a transição local permanece idempotente e
de uso único.

### Login com senha e MFA

1. O cliente escolhe `otp` ou `recovery` antes de iniciar; convite sempre usa
   `otp`, porque ainda não existem recovery codes.
2. Rate limits de e-mail e IP são incrementados antes do trabalho caro.
3. Usuário inexistente, pendente, suspenso ou desabilitado executa `scrypt`
   contra um hash descartável válido; somente o usuário ativo usa seu hash real.
4. Qualquer falha responde da mesma forma, com o mesmo trabalho local, e
   registra o motivo só na auditoria.
5. Usuário ativo com senha correta cria uma tentativa. Na opção `otp`, inicia
   Twilio Verify; na opção `recovery`, não chama o provedor externo.
6. Nenhuma sessão é emitida antes do segundo fator.
7. O segundo fator aprovado consome desafio quando houver, tentativa e recovery
   code quando houver, e cria a sessão na mesma transação.

Recovery ainda exige a senha e substitui somente o OTP. Isso permite recuperar
acesso mesmo quando o telefone ou o Twilio estiverem indisponíveis. O claim
`amr` registra `pwd` + `recovery` em vez de `pwd` + `otp`.

### Refresh e reuso

A rotação bloqueia a linha do refresh apresentado. Se estiver vivo e ainda não
consumido, a transação o consome, cria o sucessor e atualiza a sessão. Somente
depois o serviço devolve os novos tokens.

Se o hash existir, mas já estiver consumido, a mesma transação revoga a sessão
inteira e registra `token.reuse_detected`. Tokens desconhecidos, expirados ou de
sessão revogada respondem `401` vazio.

Duas chamadas concorrentes com o mesmo refresh não recebem tolerância especial:
uma pode concluir a rotação, mas a duplicata revoga a sessão, inclusive o
sucessor recém-criado. Clientes precisam serializar refresh; perder a resposta
obriga nova autenticação. Esse custo é intencional porque o servidor não
consegue distinguir retry legítimo de token roubado.

### Logout, suspensão e troca de senha

Logout revoga a sessão identificada pelo refresh apresentado. Logout global,
suspensão e troca de senha revogam todas as sessões do usuário. A troca de senha
emite uma sessão nova somente depois de password + segundo fator recentes. O
segundo fator pode ser OTP ou um recovery code ainda não usado. A regeneração
dos recovery codes exige o mesmo step-up. Access tokens já emitidos continuam
válidos até o máximo de 15 minutos; esta limitação é parte explícita do contrato.

## Política de senha

- comprimento de 12 a 128 code points após normalização NFC;
- espaços e caracteres Unicode imprimíveis são aceitos;
- a senha não sofre `trim` e não há regras de classes de caracteres;
- não existe expiração periódica;
- a senha real permanece NFC e case-sensitive; somente para a blocklist
  contextual se calcula uma visão NFKC + `toLowerCase()`;
- essa visão é recusada por igualdade integral, nunca por substring, contra
  `timeline`, `timeline_project`, e-mail normalizado, parte local do e-mail,
  nome completo e cada token alfanumérico do nome com ao menos três code points;
- a consulta externa usa SHA-1 somente para o protocolo de k-anonimato, envia
  os cinco primeiros hexadecimais e pede padding com `Add-Padding: true`;
- indisponibilidade ou timeout de dois segundos responde `503`; a senha não é
  aceita sem a verificação;
- o hash persistido usa `scrypt` N=2^15, r=8, p=1, salt aleatório de 16 bytes e
  saída de 64 bytes;
- parâmetros lidos de um hash persistido são limitados antes do `scrypt`, para
  um valor malformado não causar consumo arbitrário de memória.

## API HTTP

Tokens e códigos nunca aparecem em query string nem em path da API.

### Públicas

- `POST /auth/invites/inspect` — valida token e devolve nome, e-mail mascarado e
  expiração;
- `POST /auth/invites/accept` — recebe token, senha, telefone e canal; inicia
  MFA;
- `POST /auth/login` — recebe e-mail, senha e `secondFactor`; cria a tentativa
  e só chama Twilio quando a escolha é `otp`;
- `POST /auth/mfa/resend` — reenvia dentro dos limites;
- `POST /auth/mfa/verify` — conclui com OTP;
- `POST /auth/mfa/recover` — conclui com recovery code;
- `POST /auth/token/refresh` — rotaciona refresh;
- `POST /auth/logout` — revoga a sessão do refresh apresentado;
- `GET /.well-known/jwks.json`;
- `GET /health/live` e `GET /health/ready`.

### Autenticadas

- `GET /auth/me`;
- `POST /auth/logout-all`;
- `POST /auth/step-up/start` — confirma a senha atual, nomeia
  `password_change` ou `recovery_regeneration`, recebe `secondFactor` e só
  inicia Twilio quando a escolha é `otp`;
- `POST /auth/step-up/verify` — confirma OTP e marca a tentativa para uma única
  ação sensível;
- `POST /auth/step-up/recover` — consome um recovery code no lugar do OTP e
  marca a tentativa para a mesma ação única;
- `POST /auth/password/change` — consome o step-up, valida a senha nova, revoga
  todas as sessões e emite uma sessão substituta;
- `POST /auth/recovery-codes/regenerate` — consome o step-up e substitui o
  conjunto anterior.

### Administrativas

- `POST /auth/admin/invites`;
- `GET /auth/admin/users` com cursor e limite;
- `PATCH /auth/admin/users/:userId/status`;
- `PUT /auth/admin/users/:userId/access` — substitui papéis e permissões
  diretas como uma unidade;
- `POST /auth/admin/users/:userId/invite/reissue`;
- `DELETE /auth/admin/users/:userId/invite`;
- `POST /auth/admin/users/:userId/revoke-sessions`.

Controllers validam corpos em runtime e delegam regras a casos de uso. Rotas
estáticas são declaradas antes de parâmetros dinâmicos.

A rota administrativa de status não ativa usuários pendentes: somente a
conclusão do convite pode fazer `pending_invite → active`. Ela permite
`active ↔ suspended` e a transição terminal para `disabled`; reativar um
usuário desabilitado não faz parte da etapa 1.

Na etapa 1, todas as rotas sob `/auth/admin` exigem `*:manage`. Permissões
administrativas parciais e delegação de administração não fazem parte desta
fatia; assim, convite e substituição de acesso não criam uma escalada indireta.

Antes de step-up, troca de senha, regeneração de recovery codes ou qualquer
emissão nova, o caso de uso relê usuário e sessão de origem. Ambos precisam
continuar ativos e não revogados dentro da transação final; um access token ainda
aceito por outro serviço durante seu TTL não consegue recriar sessão no auth.

O serviço retorna access e refresh tokens em JSON. Ele não cria cookies. O
futuro BFF guardará tokens fora do JavaScript do browser e emitirá sua própria
sessão `HttpOnly`; o futuro mobile guardará refresh no armazenamento seguro do
aparelho.

## JWT e JWKS

O access token usa Ed25519 com algoritmo fixo `EdDSA`, header `typ: at+jwt` e
um `kid` pertencente ao JWKS do próprio serviço. O payload contém:

```text
iss, aud, sub, sid, jti, iat, exp,
perms, denies, roles, amr, auth_time
```

- TTL: 900 segundos;
- audience inicial: `timeline-api`;
- tolerância máxima de relógio: 30 segundos;
- `sid` permanece estável durante as rotações da sessão;
- `jti` é aleatório por access token;
- `amr` e `auth_time` preservam a autenticação original durante refresh;
- não existem `ver` nem revogação por usuário no caminho local.

A validação rejeita algoritmo, `typ`, `kid`, issuer ou audience inesperados,
assinatura inválida, claims ausentes ou de tipo incorreto, tokens expirados e
tokens emitidos no futuro. `perms`, `denies`, `roles` e `amr` precisam ser
arrays de strings válidas, não apenas valores aceitos pelo TypeScript;
`auth_time` precisa ser um NumericDate que não esteja no futuro.

O JWKS publica chaves `active` e `retiring`, com ETag e
`Cache-Control: public, max-age=300, stale-if-error=3600`. Uma chave antiga só
vira `retired` depois de 930 segundos da última emissão possível. A chave
privada é cifrada com AES-256-GCM usando uma KEK de 32 bytes fornecida pelo
ambiente. Cada JWK pública contém somente `kty: OKP`, `crv: Ed25519`, `x`,
`kid`, `use: sig` e `alg: EdDSA`; material privado nunca entra na resposta.

## Respostas e observabilidade

- `400`: JSON malformado, tipo incorreto ou contrato inválido;
- `422`: senha recusada ou outra entrada semanticamente inválida, com mensagem
  segura e acionável;
- `401`: corpo vazio para identidade, credencial, convite, MFA ou sessão
  inválidos;
- `403`: corpo vazio para ator autenticado sem permissão;
- `409`: conflito visível apenas em operações administrativas, como e-mail já
  cadastrado;
- `429`: corpo vazio e `Retry-After`;
- `503`: dependência indispensável indisponível, sem nomear o provedor;
- `500`: falha real, com código genérico e correlation id.

Mensagens, status e custo do caminho são equivalentes para e-mail inexistente,
senha errada, usuário suspenso ou usuário ainda pendente. O motivo real fica em
auditoria. “Custo equivalente” aqui é uma propriedade estrutural testável: todos
normalizam a entrada, aplicam os mesmos rate limits e executam exatamente um
`scrypt` com os parâmetros vigentes antes do mesmo `401`. Não se promete uma
diferença máxima de milissegundos, que seria instável entre hosts.

Auditoria registra, entre outros, bootstrap, convite, aceite, falhas de login,
envio e verificação MFA, uso e regeneração de recovery codes, emissão e
revogação de sessão, refresh, detecção de reuso, alteração administrativa e
rotação de chave. Senha, OTP, token, cookie, chave privada e header
`Authorization` nunca entram em log, erro ou metadata.

Quando um evento de auditoria descreve uma mudança persistente de segurança,
ele é inserido na mesma transação da mudança. Falhas que não alteram estado são
registradas em uma transação própria.

IP vem inicialmente do socket. O serviço não confia em `X-Forwarded-For` nem
em `x-user-id`. Uma futura borda pública terá de sanitizar headers e configurar
explicitamente proxies confiáveis.

## Dependências externas

Twilio Verify é acessado por `fetch`, sem SDK adicional, com
`AbortSignal.timeout` de cinco segundos por padrão. Iniciar ou conferir uma
verificação faz uma única chamada: não há retry automático, porque ele pode
duplicar mensagens ou esconder o resultado de uma aprovação. Timeout, falha de
transporte e rejeições de configuração de remetente, template, canal ou país
viram `503` externo e motivo específico apenas na auditoria.

Não há fallback automático entre WhatsApp e SMS, inclusive na configuração do
Verify. O desafio registra o canal pedido e o canal confirmado pelo provedor;
se forem diferentes, o desafio fica inutilizável, a resposta é `503` e a
auditoria registra o mismatch sem destino em claro. WhatsApp só pode ser
habilitado depois de remetente, templates, países de destino e conta serem
validados em um smoke test operacional real. Cada canal habilitado precisa desse
teste no ambiente antes da liberação.

O adaptador fake aceita o código fixo `000000` sem escrevê-lo em logs. Ele só
pode iniciar quando, simultaneamente, `NODE_ENV` é exatamente `development` ou
`test`, `AUTH_HOST` é loopback e `AUTH_ALLOW_FAKE_OTP=true`. Valor ausente
ou qualquer outro ambiente faz o startup recusar `AUTH_OTP_PROVIDER=fake`.

Pwned Passwords usa a range API sem chave, com user-agent identificável,
padding e timeout de dois segundos. Nenhum fallback aceita senha sem blocklist.

Health checks não chamam Twilio nem Pwned Passwords. `live` confirma que o
processo responde; `ready` confirma conexão Postgres, migrações aplicadas e uma
chave ativa carregada.

## Configuração

O auth segue a precedência `.env.local` sobre `.env`. Além dos TTLs já
especificados, a etapa usa:

- `AUTH_PORT`, padrão `3002`;
- `AUTH_HOST`, padrão `127.0.0.1`;
- `AUTH_DATABASE_URL`;
- `AUTH_DATABASE_MIGRATION_URL`;
- `AUTH_ISSUER`;
- `AUTH_AUDIENCE`, padrão `timeline-api`;
- `AUTH_PUBLIC_URL`;
- `AUTH_WEB_APP_URL`;
- `AUTH_KEY_ENCRYPTION_KEY`;
- `AUTH_OTP_PROVIDER`, `fake` ou `twilio`;
- `AUTH_ALLOW_FAKE_OTP`, padrão `false`;
- `AUTH_TWILIO_TIMEOUT_MS`, padrão `5000`;
- `AUTH_TWILIO_WHATSAPP_ENABLED`, padrão `false`;
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` e
  `TWILIO_VERIFY_SERVICE_SID`;
- `AUTH_PASSWORD_BLOCKLIST_TIMEOUT_MS`, padrão `2000`;
- `AUTH_TEST_DATABASE_URL`, aceito somente pelo processo de testes;
- limites de senha, IP, envio MFA e checks, com os padrões definidos neste
  documento.

Configuração inconsistente falha no startup. Migrações não rodam
automaticamente ao subir o processo.

O comando idempotente
`pnpm --filter @repo/auth run cleanup-auth-data` usa advisory lock e é agendado
externamente uma vez por dia. Ele aplica estas retenções:

- tentativas, desafios e rate-limit buckets encerrados: 24 horas;
- convites aceitos, revogados ou expirados: 30 dias;
- recovery codes usados ou revogados: 90 dias;
- sessões revogadas e todos os seus refresh hashes: 90 dias;
- chaves aposentadas: JWK pública permanente, material privado apagado;
- auditoria: não é removida por esta rotina.

Refresh hashes consumidos nunca são removidos enquanto a sessão estiver viva;
removê-los antes quebraria detecção de reuso. A rotina marca como encerrada a
sessão sem nenhum refresh não consumido e ainda válido; os 90 dias contam desse
encerramento quando não houve revogação explícita.

## Estratégia de testes

### Unitários

- normalização e política de senha;
- hash e verificação scrypt, inclusive limites de parâmetros;
- JWT e validação estrita de claims;
- resolução de allow/deny;
- estados de convite, tentativa, desafio, sessão e recovery code;
- mapeamento seguro de erros;
- validação cruzada da configuração, inclusive o bloqueio do OTP fake.

### Casos de uso

Repositórios em memória exercitam cada fluxo e cada falha sem Postgres. Twilio
e Pwned Passwords usam fakes explícitos. Relógio e geração de segredos são
controláveis em teste. Há casos para timeout e falha dos provedores, bootstrap
reexecutado, troca de senha, regeneração de recovery codes e todas as transições
administrativas permitidas ou proibidas. Spies comprovam exatamente um
`scrypt` nos quatro caminhos uniformes; recovery conclui login e step-up com o
Twilio indisponível; usuário ou sessão de origem inativos não emitem sessão.

### Integração Postgres

Migrações e repositórios rodam contra Postgres real descartável indicado por
`AUTH_TEST_DATABASE_URL`. Os testes comprovam constraints, locks, isolamento e
rollback. Em particular:

- dois aceites simultâneos ativam uma vez;
- a tentativa vencedora grava exatamente sua própria senha, telefone e canal;
- dois checks do mesmo desafio criam no máximo uma sessão;
- um recovery code concorrente é consumido uma vez;
- em duas rotações do mesmo refresh, no máximo uma resposta tem sucesso e a
  duplicata revoga a sessão inteira;
- reuso do token consumido revoga a sessão;
- duas rotações de chave não produzem zero ou duas chaves ativas;
- duas remoções concorrentes de acesso não deixam zero administradores capazes;
- falha no meio de convite + RBAC não deixa usuário parcial.

### HTTP end-to-end

Uma aplicação Nest real usa Postgres de teste e servidores HTTP fake para as
dependências. Os testes cobrem status, corpo vazio, `Retry-After`, correlation
id, ordem das rotas, autenticação administrativa, JWKS, health checks e
redação de segredos. Também comprovam que auditoria acompanha a transação,
reconvite substitui o link anterior, retenção respeita os prazos e restart não
zera rate limits.

### Gates

```text
npm run --silent test:ai
pnpm --filter @repo/auth run typecheck
pnpm --filter @repo/auth run build
```

O typecheck atual falha na tipagem promisificada de `scrypt` e no uso global de
`JsonWebKey`; a primeira fatia corrige ambos antes de acrescentar comportamento.

## Critério de conclusão

A etapa 1 está concluída quando:

1. um Postgres vazio recebe a migração inicial e os três papéis de sistema;
2. o CLI cria exatamente um primeiro administrador, recupera a falha
   commit-antes-do-output e imprime um único convite vigente;
3. o admin aceita o convite com senha válida, telefone verificado e recebe 10
   recovery codes;
4. login exige senha e segundo fator; OTP usa Twilio Verify e recovery não
   depende do provedor;
5. um recovery code pode substituir o OTP uma única vez em login ou step-up;
6. refresh rotaciona atomicamente e reuso revoga a sessão;
7. logout e suspensão impedem novos refreshes;
8. cada access token é verificável usando somente um snapshot do JWKS, sem
   consulta ao banco nem callback ao auth, e rotação preserva tokens ainda
   válidos sem deixar duas chaves ativas;
9. troca de senha e regeneração de recovery codes exigem step-up, são atômicas
   e revogam o estado anterior definido neste contrato;
10. rate limits persistentes mantêm efeito depois de restart e em múltiplas
    réplicas;
11. timeouts e erros de Twilio ou Pwned Passwords produzem `503` seguro, e
    cada canal Twilio habilitado passa pelo smoke test do ambiente;
12. o provedor fake é impossível fora da combinação local explicitamente
    permitida;
13. auditoria é append-only, acompanha a transação de segurança e não contém
    segredos;
14. a rotina de retenção cumpre exatamente os prazos deste documento sem
    remover hashes necessários à detecção de reuso;
15. `*:manage` protege listagem, status, substituição de acesso, convites e
    revogação administrativas, e mutações concorrentes não removem o último
    administrador capaz;
16. respostas externas não enumeram usuários nem expõem segredos;
17. testes, typecheck e build passam pelos comandos oficiais do monorepo.

## Reconciliação com o documento de origem

Para a etapa 1, estas decisões substituem explicitamente trechos incompatíveis
de `apps/auth/PLANO.md`:

- `ver`, `tokenVersion` e consulta de revogação por request são removidos;
  revogação de access token é limitada ao TTL de 15 minutos;
- não existe `mfaEnabled` nem sessão ativa obtida apenas com senha; MFA é
  obrigatório para todo usuário ativo;
- OTP local com HMAC e gateways próprios de mensagem dão lugar ao Twilio Verify,
  que gera, envia e confere o código;
- identidade ou credencial inválida retorna `401` vazio, não `500`;
- a tabela abrangente `login_attempts` passa a se chamar
  `authentication_attempts` porque também sustenta convite e step-up;
- `identities` e `oauth_states` ficam para OAuth na etapa 2;
- `access_grants` e integração com `apps/api` ficam para a etapa 3;
- cookies e sessão BFF ficam para a etapa 4;
- a alternativa Meta versus Twilio está resolvida em favor do Twilio Verify
  nesta etapa.

O restante do documento de origem continua servindo como visão futura, mas não
autoriza antecipar tabelas, rotas ou abstrações das etapas 2 a 5.

## Referências de segurança

- [NIST SP 800-63B — Authentication and Authenticator Management](https://pages.nist.gov/800-63-4/sp800-63b.html);
- [RFC 9700 — OAuth 2.0 Security Best Current Practice](https://datatracker.ietf.org/doc/html/rfc9700);
- [RFC 10017 — OAuth 2.0 for Browser-Based Applications](https://datatracker.ietf.org/doc/html/rfc10017);
- [RFC 8252 — OAuth 2.0 for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252);
- [Twilio Verify API](https://www.twilio.com/docs/verify/api);
- [Have I Been Pwned — Pwned Passwords API](https://haveibeenpwned.com/API/v3#PwnedPasswords).
