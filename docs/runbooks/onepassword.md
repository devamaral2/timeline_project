# Ambiente via 1Password

O monorepo resolve as variáveis do `.env.example` no início de cada comando
de aplicação usando o SDK JavaScript do 1Password, uma Service Account e um
Environment. O repositório não contém os valores e não depende de login
interativo no desktop.

## Configurar o 1Password

1. Crie um Environment no 1Password e guarde o ID dele, por exemplo
   `timeline-local`.
2. Dê à Service Account acesso de leitura ao Environment.
3. Crie no Environment cada variável listada em `.env.example`, usando
   exatamente os nomes do contrato, como `DATABASE_URL`.
4. Guarde o token da Service Account fora do Git e configure, no shell ou no
   gerenciador de segredos do ambiente:

   ```bash
   export OP_SERVICE_ACCOUNT_TOKEN='token-da-service-account'
   export OP_ENVIRONMENT_ID='timeline-local'
   ```

O SDK oficial recomenda Service Accounts para automação e acesso de menor
privilégio: <https://www.1password.dev/sdks>.

## Confirmar acesso

```bash
pnpm secrets:check
pnpm secrets:check-one -- AUTH_KEY_ENCRYPTION_KEY
```

O primeiro comando valida todas as variáveis; o segundo consulta somente a
variável indicada. Ambos listam apenas nomes e nunca imprimem valores.

## Inserir o token com segurança

Não coloque o token em `package.json`, `.env.example`, Git, mensagem de
commit, argumento do comando ou mensagem de chat. A forma recomendada para um
teste local é digitá-lo silenciosamente no shell atual:

```bash
read -r -s OP_SERVICE_ACCOUNT_TOKEN
export OP_SERVICE_ACCOUNT_TOKEN
export OP_ENVIRONMENT_ID='timeline-local'
pnpm secrets:check-one -- AUTH_KEY_ENCRYPTION_KEY
unset OP_SERVICE_ACCOUNT_TOKEN OP_ENVIRONMENT_ID
```

O token fica apenas na memória do shell e é herdado pelo processo Node. Para
uso recorrente, armazene-o em um gerenciador de segredos do sistema ou em um
Kubernetes Secret com permissão mínima; não o salve em arquivo dentro da
worktree.

## Executar outros comandos

Qualquer comando pode ser executado com o ambiente resolvido:

```bash
pnpm secrets:exec -- node -e 'console.log(Boolean(process.env.DATABASE_URL))'
pnpm secrets:exec -- pnpm --filter @repo/auth run db:migrate
```

`pnpm dev`, `pnpm dev:api`, `pnpm dev:auth`, `pnpm dev:web`, `pnpm dev:mobile`
e `pnpm build` já usam esse carregador automaticamente.

## Worktrees

As worktrees continuam recebendo portas e nomes de banco próprios. O arquivo
`.env.local` delas contém somente esses overrides locais; credenciais e URLs
com senha são reconstruídas em memória usando os valores do Environment no
1Password.

## Kubernetes/k3s

Crie um Secret por ambiente contendo somente `OP_SERVICE_ACCOUNT_TOKEN` e
`OP_ENVIRONMENT_ID`, referencie-o nos Deployments e disponibilize o token também no job
que executa o build do Web. Não coloque o token em imagem, manifesto
versionado, `ConfigMap` ou `.env`.

O Web precisa das variáveis durante `next build`, porque `NEXT_PUBLIC_*` e o
rewrite de `BACKEND_URL` são definidos no build. API e Auth também resolvem o
ambiente antes de iniciar o processo.
