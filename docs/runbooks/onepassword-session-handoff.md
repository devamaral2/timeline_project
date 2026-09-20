# Handoff: 1Password

## Estado atual

- O monorepo usa um carregador em `scripts/onepassword/`.
- O carregador usa o SDK JavaScript e lê todas as variáveis de um 1Password
  Environment por `OP_ENVIRONMENT_ID`.
- O contrato das variáveis fica em `.env.example`.
- `pnpm secrets:check` valida todas as variáveis sem imprimir valores.
- `pnpm secrets:check-one -- NOME_DA_ENV` valida uma variável.
- `pnpm secrets:exec -- <comando>` executa um comando com as variáveis
  resolvidas.
- `pnpm dev`, `pnpm dev:web`, `pnpm dev:api`, `pnpm dev:auth`, `pnpm build`
  já passam pelo carregador automaticamente.

## Como testar o carregador atual

```bash
read -r -s OP_SERVICE_ACCOUNT_TOKEN
export OP_SERVICE_ACCOUNT_TOKEN
export OP_ENVIRONMENT_ID='timeline-local'
pnpm secrets:check
```

O token nunca deve ser enviado pelo chat, colocado no Git, em `package.json`,
em `.env.example` ou passado como argumento do comando.

O SDK precisa ser `@1password/sdk` `0.5.x` ou mais recente, pois as versões
antigas não expõem `client.environments.getVariables`. Não guardar tokens neste
arquivo.

## Decisões funcionais relacionadas

- Firebase e Twilio foram removidos do web/API/auth; Firebase mobile permanece
  fora deste escopo.
- O fluxo atual de autenticação é login comum por e-mail e senha.
- MFA/OTP e SMTP não fazem parte das variáveis atuais nem do runtime web/auth.
- Variáveis Firebase e SMTP antigas devem continuar desconsideradas.
