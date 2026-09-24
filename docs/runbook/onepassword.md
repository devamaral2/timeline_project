# 1Password: ambiente local e produção

O repositório usa o SDK do 1Password para carregar variáveis no processo. O
token de uma Service Account não é uma variável da aplicação e nunca deve ser
incluído no `.env.example`, em imagens ou em manifests versionados.

## Ambiente local

Crie um Environment para desenvolvimento e configure no shell:

```bash
export OP_SERVICE_ACCOUNT_TOKEN='token-da-service-account-local'
export OP_ENVIRONMENT_ID='timeline-local'
pnpm secrets:check
```

O loader usa `.env.example` como contrato completo no modo padrão. Os overrides
locais permitidos ficam em `.env.local`, que não entra no Git.

## Ambiente de produção

Crie um Environment chamado, por exemplo, `timeline-production` e uma Service
Account somente leitura para ele. Preencha os valores com as credenciais geradas
no [runbook de deploy k3s](./deploy-k3s.md), sem reutilizar senhas locais.

Os scopes de produção são:

- `api-runtime`: `DATABASE_URL`, `AUTH_SERVICE_URL` e, se usados, a chave e os
  modelos do OpenRouter.
- `auth-runtime`: `NODE_ENV`, `AUTH_DATABASE_URL`, `AUTH_ISSUER`,
  `AUTH_PUBLIC_URL`, `AUTH_WEB_APP_URL`, `AUTH_KEY_ENCRYPTION_KEY`,
  `AUTH_AUDIENCE`, `API_SERVICE_URL`, a chave interna e os limites de senha.
- `web-build`: `BACKEND_URL=http://api.braid.svc.cluster.local:3001` e
  `AUTH_SERVICE_URL=http://auth.braid.svc.cluster.local:3002`.

Não adicione ao ambiente de produção `AUTH_TEST_DATABASE_URL`, `ADMIN_PASSWORD`,
portas locais ou o IP privado usado pelo mobile. O mobile continua fora do
deploy k3s.

Na VPS, salve o token em arquivo root-only e crie o Secret usado pelos pods:

```bash
umask 077
read -rsp "Token da Service Account de produção: " OP_TOKEN; echo
printf '%s' "$OP_TOKEN" > /opt/braid/private/onepassword-token
unset OP_TOKEN
chmod 600 /opt/braid/private/onepassword-token

kubectl -n braid create secret generic onepassword-loader \
  --from-file=OP_SERVICE_ACCOUNT_TOKEN=/opt/braid/private/onepassword-token \
  --from-literal=OP_ENVIRONMENT_ID="$OP_ENVIRONMENT_ID"
```

Valide antes de iniciar os Deployments. Os containers de API e Auth usam,
respectivamente, `ONEPASSWORD_SCOPE=api-runtime` e
`ONEPASSWORD_SCOPE=auth-runtime`.

```bash
OP_SERVICE_ACCOUNT_TOKEN="$(cat /opt/braid/private/onepassword-token)" \
  OP_ENVIRONMENT_ID="$OP_ENVIRONMENT_ID" \
  ONEPASSWORD_SCOPE=api-runtime node scripts/onepassword/check.mjs
```

Depois de alterar uma variável do Environment, reinicie somente os serviços
afetados. Depois de rotacionar o token da Service Account, atualize o arquivo,
recrie o Secret e reinicie API/Auth.
