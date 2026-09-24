# Integrar a aplicação em produção ao 1Password e ao GitHub Actions

Este roteiro começa com a aplicação **já publicada e funcionando**: VPS, VPN,
k3s, PostgreSQL, Traefik, Cloudflare Tunnel, domínio e repositório GitHub já
existem. O trabalho aqui é migrar as variáveis da aplicação para um Environment
de produção do 1Password, ativar o SDK que já está no código e configurar o
deploy por GitHub Actions. Não recrie bancos, PVCs, namespaces, Tunnel ou
usuários da aplicação. O mobile não é implantado por este workflow.

Os comandos marcados **VPS** usam Bash em `sudo -i`; os marcados
**computador** rodam na sua máquina. Ajuste nomes de namespace, domínio e
caminhos se a instalação atual for diferente. O procedimento versionado espera
`/opt/braid`, namespace `braid`, repositório
`git@github.com:devamaral2/timeline_project.git` e deployments `web`,
`auth`, `api`. Confira isso antes de executar o primeiro deploy.

## 1. Inventariar a instalação atual

**VPS:** registre o estado antes da migração, sem imprimir valores de Secrets:

```bash
sudo -i
set -euo pipefail
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
kubectl -n braid get deploy,svc,ingress,pvc
kubectl -n braid get secrets
kubectl -n braid get deploy web auth api -o yaml
kubectl -n braid get ingress api -o yaml
if test -d /opt/braid/src/.git; then
  git -C /opt/braid/src remote -v
  git -C /opt/braid/src status --short
fi
test -d /opt/braid/private
test -d /opt/braid/backups
```

Se `/opt/braid/src` ainda não existir, a clonagem está no passo 3. Se os
deployments atuais usam `api-env`, `auth-env`, `.env` ou
`/opt/braid/private/generated.env`, recupere os valores necessários e
compare-os com os bancos **antes** de alterar a aplicação. Não gere novas
senhas: `DATABASE_URL` e `AUTH_DATABASE_URL` devem continuar apontando
para os usuários e bancos já existentes. Guarde as credenciais recuperadas no
1Password. Mantenha os Secrets antigos até o novo rollout estar saudável.

O fluxo de requisições esperado é `browser → Next → Auth → API`. O endereço
público `api.SEUDOMINIO`, se usado pelo mobile, também deve chegar ao
**Auth**. Verifique o backend do Ingress `api` agora. Se ele ainda aponta
para `api:3001`, planeje a troca para `auth:3002` **depois** do rollout do
novo Auth no passo 5. Trocar antes disso pode interromper o mobile. O Service
`api:3001` continua interno para o Auth.

## 2. Preparar o Environment de produção no 1Password

No painel 1Password, crie ou selecione um **Environment de produção** e uma
**Service Account** com acesso de leitura a ele. Anote o *ID real* do
Environment e copie o token da conta uma vez para armazenamento seguro. O
carregador em `scripts/onepassword/loader.mjs` usa `@1password/sdk` e lê
as variáveis desse Environment por `OP_ENVIRONMENT_ID`; ele não interpreta
`env.tmpl` nem referências `op://` em produção.

Cadastre as variáveis abaixo usando os valores atuais de produção:


| Escopo no código | Variáveis obrigatórias no Environment                                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api-runtime`    | `DATABASE_URL`, `AUTH_SERVICE_URL`, `AUTH_INTERNAL_SERVICE_KEY`                                                                                                                   |
| `auth-runtime`   | `NODE_ENV`, `AUTH_DATABASE_URL`, `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_PUBLIC_URL`, `AUTH_WEB_APP_URL`, `AUTH_KEY_ENCRYPTION_KEY`, `AUTH_INTERNAL_SERVICE_KEY`, `API_SERVICE_URL` |
| `web-build`      | `BACKEND_URL`, `AUTH_SERVICE_URL`                                                                                                                                                 |


Os valores típicos dentro do cluster são:

```dotenv
DATABASE_URL=postgres://braid:<SENHA_ATUAL>@postgres.braid.svc.cluster.local:5432/braid
AUTH_DATABASE_URL=postgres://auth_runtime:<SENHA_ATUAL>@postgres.braid.svc.cluster.local:5432/braid_auth
AUTH_SERVICE_URL=http://auth.braid.svc.cluster.local:3002
API_SERVICE_URL=http://api.braid.svc.cluster.local:3001
BACKEND_URL=http://auth.braid.svc.cluster.local:3002
AUTH_ISSUER=https://auth.SEUDOMINIO
AUTH_PUBLIC_URL=https://auth.SEUDOMINIO
AUTH_WEB_APP_URL=https://timeline.SEUDOMINIO
AUTH_AUDIENCE=braid-api
NODE_ENV=production
```

Substitua o domínio e use os nomes reais de Service e banco da instalação.
Codifique caracteres reservados das senhas nas URLs PostgreSQL. A
`AUTH_INTERNAL_SERVICE_KEY` precisa ter pelo menos 32 caracteres e ser **a
mesma** para API e Auth. A `AUTH_KEY_ENCRYPTION_KEY` existente deve ser
preservada: trocá-la pode impedir a leitura das chaves de assinatura atuais.
Se usar OpenRouter, copie também `OPENROUTER_API_KEY`,
`OPENROUTER_MODEL` e `OPENROUTER_AGENT_MODEL`; os limites
`AUTH_PASSWORD_*` são opcionais. Não inclua `ADMIN_PASSWORD` nem
`AUTH_TEST_DATABASE_URL`. `AUTH_SERVICE_URL` ainda consta no contrato do
loader da API, embora a API não faça requisições ao Auth.

O SDK faz a leitura no início dos processos da API e do Auth. No Web,
`BACKEND_URL` e `AUTH_SERVICE_URL` são lidos durante `next build`;
alterá-los exige uma nova imagem. A API não consulta Auth: Auth valida a
sessão, autoriza e encaminha à API pela `API_SERVICE_URL`.

**VPS:** confira se `/opt/braid/env.sh` já contém `DOMAIN` e
`OP_ENVIRONMENT_ID`. Se o ID ainda faltar, acrescente uma linha
`export OP_ENVIRONMENT_ID=...` com o ID real, mantendo o arquivo root-only
(`chmod 600 /opt/braid/env.sh`). Não grave o token nesse arquivo.

```bash
source /opt/braid/env.sh
test -n "${DOMAIN:-}"
test -n "${OP_ENVIRONMENT_ID:-}"
install -d -m 0700 /opt/braid/private
umask 077
read -rsp 'Token da Service Account de produção: ' OP_TOKEN; echo
printf '%s' "$OP_TOKEN" > /opt/braid/private/onepassword-token
unset OP_TOKEN
chmod 600 /opt/braid/private/onepassword-token
kubectl -n braid create secret generic onepassword-loader \
  --from-file=OP_SERVICE_ACCOUNT_TOKEN=/opt/braid/private/onepassword-token \
  --from-literal=OP_ENVIRONMENT_ID="$OP_ENVIRONMENT_ID" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n braid get secret onepassword-loader
```

Esse Secret contém só o token e o ID; os valores da aplicação são obtidos pelo
SDK. Não cadastre `OP_SERVICE_ACCOUNT_TOKEN` no GitHub. O token também não
deve entrar em imagem, `.env` versionado ou saída de log.

## 3. Preparar a identidade de deploy na VPS

O workflow existente conecta por SSH e pede à VPS para publicar um SHA de
`main`. A VPS busca o código com uma **Deploy Key de leitura**, separada da
chave que o GitHub Actions usa para conectar. Se `/opt/braid/src` e a Deploy
Key já existem, valide-os e avance; não substitua chaves em uso.

**VPS, somente se a Deploy Key ainda não existir:**

```bash
test ! -e /opt/braid/private/github-deploy
ssh-keygen -t ed25519 -f /opt/braid/private/github-deploy -N '' -C timeline-vps-readonly
chmod 600 /opt/braid/private/github-deploy
cat /opt/braid/private/github-deploy.pub
```

No GitHub, adicione a chave pública em **Settings → Deploy keys**, com
**Allow write access** desmarcado. Confirme o fingerprint SSH de
`github.com` antes de aceitar a primeira conexão.

**VPS, se o clone ainda não existir:**

```bash
export GIT_SSH_COMMAND='ssh -i /opt/braid/private/github-deploy -o IdentitiesOnly=yes -o BatchMode=yes'
test ! -e /opt/braid/src
git clone git@github.com:devamaral2/timeline_project.git /opt/braid/src
git -C /opt/braid/src status --short
```

O deploy exige o clone limpo e o remote `origin` exatamente igual a
`git@github.com:devamaral2/timeline_project.git`. Os scripts
`ops/production/` e os dois workflows precisam estar publicados em
`main` antes do primeiro job de produção.

O backup automático executado **antes** de cada deploy espera os caminhos
abaixo. Confira os existentes. Se faltar um arquivo de versão, recupere a
versão realmente instalada; não preencha com um valor presumido.

```bash
source /opt/braid/env.sh
test -d /opt/braid/backups
test -d /opt/braid/k8s
test -r /opt/braid/k3s-version.txt
test -r /opt/braid/monitoring-version.txt
kubectl -n braid get pod postgres-0
kubectl -n braid get secret postgres-env -o json |
  jq -e '.data | has("PG_APP_PASSWORD") and has("AUTH_OWNER_PASSWORD")'
```

Se ainda não houver `backup-passphrase`, escolha uma passphrase nova,
guarde-a fora da VPS e crie o arquivo com permissão 600:

```bash
test ! -e /opt/braid/private/backup-passphrase
umask 077
read -rsp 'Nova passphrase do backup (já guardada fora da VPS): ' BACKUP_PASSPHRASE; echo
test -n "$BACKUP_PASSPHRASE"
printf '%s' "$BACKUP_PASSPHRASE" > /opt/braid/private/backup-passphrase
unset BACKUP_PASSPHRASE
chmod 600 /opt/braid/private/backup-passphrase
```

Confira `test -r /opt/braid/private/backup-passphrase` antes do deploy. Isso
não altera PostgreSQL. O Secret `postgres-env` precisa conservar as senhas atuais
usadas pelo script de migration; se a instalação usa outro nome ou chaves,
adapte `ops/production/deploy-release.sh` **antes** do primeiro deploy.

**VPS:** instale os comandos versionados como root. Execute após confirmar
que o checkout local contém a versão que irá publicar.

```bash
cd /opt/braid/src
test -z "$(git status --porcelain)"
install -d -m 0755 /opt/braid/bin
install -m 0750 -o root -g root ops/production/backup.sh /opt/braid/bin/backup.sh
install -m 0750 -o root -g root ops/production/check-auth-schema.sh /opt/braid/bin/check-auth-schema.sh
install -m 0750 -o root -g root ops/production/braid-deploy-wrapper.sh /opt/braid/bin/braid-deploy
install -m 0755 -o root -g root ops/production/ssh-deploy-entry.sh /opt/braid/bin/ssh-deploy-entry
bash ops/production/check-auth-schema.sh /opt/braid/src
```

Esses arquivos instalados não se atualizam sozinhos com o `git fetch` do
wrapper. Reinstale-os de forma controlada quando uma release mudar os scripts
de `ops/production/`. O template dos apps é lido do checkout no deploy.

## 4. Configurar GitHub Actions e o acesso SSH

**Computador:** gere uma chave dedicada ao Actions e copie apenas a pública
para a VPS. Guarde a privada para o Secret do Environment `production`.

```bash
ssh-keygen -t ed25519 -f "$HOME/.ssh/timeline-actions" -N '' -C timeline-actions
cat "$HOME/.ssh/timeline-actions.pub"
```

**VPS:** crie a conta de deploy se ela ainda não existir. Se já existir,
inspecione `authorized_keys` e `sudoers` antes de alterá-los. O comando
forçado aceita somente `sudo -n /opt/braid/bin/braid-deploy <SHA>`.

```bash
if ! id gha-deploy >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/gha-deploy --create-home --shell /bin/bash gha-deploy
fi
getent passwd gha-deploy
install -d -m 0700 -o gha-deploy -g gha-deploy /var/lib/gha-deploy/.ssh
test ! -e /var/lib/gha-deploy/.ssh/authorized_keys
read -rp 'Chave pública timeline-actions: ' GHA_PUBLIC_KEY
[[ "$GHA_PUBLIC_KEY" =~ ^ssh-ed25519[[:space:]]+[A-Za-z0-9+/=]+([[:space:]].*)?$ ]]
printf 'restrict,command="/opt/braid/bin/ssh-deploy-entry" %s\n' "$GHA_PUBLIC_KEY" > /var/lib/gha-deploy/.ssh/authorized_keys
chown gha-deploy:gha-deploy /var/lib/gha-deploy/.ssh/authorized_keys
chmod 600 /var/lib/gha-deploy/.ssh/authorized_keys
test ! -e /etc/sudoers.d/braid-github-deploy
printf '%s\n' 'gha-deploy ALL=(root) NOPASSWD: /opt/braid/bin/braid-deploy *' > /etc/sudoers.d/braid-github-deploy
chmod 440 /etc/sudoers.d/braid-github-deploy
visudo -cf /etc/sudoers.d/braid-github-deploy
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

Se a conta existente usa `/usr/sbin/nologin`, ajuste-a com
`usermod --shell /bin/bash gha-deploy` antes do teste SSH.

**Computador:** obtenha a chave pública do servidor pelo SSH e compare seu
fingerprint com a última saída da VPS antes de cadastrá-la no GitHub:

```bash
read -rp 'Host ou IP da VPS: ' PROD_HOST
read -rp 'Porta SSH [22]: ' PROD_PORT
PROD_PORT=${PROD_PORT:-22}
ssh-keyscan -p "$PROD_PORT" -t ed25519 "$PROD_HOST" > "$HOME/.ssh/timeline-production-known-hosts"
ssh-keygen -lf "$HOME/.ssh/timeline-production-known-hosts"
```

O workflow atual roda em `ubuntu-latest` e conecta ao `PROD_HOST` por SSH.
Confirme que **esse runner** consegue chegar ao host/porta escolhidos. Uma VPN
configurada só no computador do operador não dá acesso ao runner. Se o SSH da
VPS for acessível exclusivamente pela VPN, inclua no workflow a conexão à VPN
com o provedor usado na instalação, ou escolha um runner já conectado à rede,
e teste esse caminho antes de ativar o deploy. Não use o IP privado da VPN
em `PROD_HOST` enquanto o workflow não estabelecer essa rota.

No GitHub, vá a **Settings → Environments → New environment** e crie
`production` **antes** de executar o workflow. Se disponível no plano do
repositório, exija **Required reviewers**. Restrinja **Deployment branches**
à branch `main`. Em repositórios privados, confira a disponibilidade dessas
regras no [plano GitHub](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).


| Tipo no Environment `production` | Nome                   | Valor                                                  |
| -------------------------------- | ---------------------- | ------------------------------------------------------ |
| Variable                         | `PROD_HOST`            | Host ou IP SSH da VPS                                  |
| Variable                         | `PROD_PORT`            | Porta SSH, normalmente `22`                            |
| Variable                         | `PROD_USER`            | `gha-deploy`                                           |
| Secret                           | `PROD_SSH_PRIVATE_KEY` | Conteúdo completo de `timeline-actions`                |
| Secret                           | `PROD_KNOWN_HOSTS`     | Conteúdo completo de `timeline-production-known-hosts` |
|                                  |                        |                                                        |


Em **Settings → Rules → Rulesets**, proteja `main`: PR obrigatório,
force push bloqueado e check `CI / validate` exigido depois de confirmar
o nome exato no primeiro PR. O workflow
[ci.yml](../../.github/workflows/ci.yml) executa lint
(atualmente informativo), typecheck, testes unitários, build e Playwright
E2E; usa PostgreSQL temporário do Testcontainers e não precisa do 1Password.
O [deploy-production.yml](../../.github/workflows/deploy-production.yml)
repete a validação, espera o Environment `production` e só então acessa
a VPS. O job de deploy não recebe token do 1Password.

**Computador:** teste a chave de deploy. A conexão SSH deve funcionar e o
comando `true` deve ser recusado com `Comando de deploy inválido`:

```bash
ssh -p "$PROD_PORT" -i "$HOME/.ssh/timeline-actions" \
  -o UserKnownHostsFile="$HOME/.ssh/timeline-production-known-hosts" \
  -o StrictHostKeyChecking=yes "gha-deploy@$PROD_HOST" true
```

## 5. Primeiro deploy com SDK e verificação

Antes do merge, revise as migrations e confira no painel que a Service Account
tem acesso ao Environment correto. O procedimento de deploy constrói as imagens **na VPS**,
faz backup, aplica migrations, importa as imagens no k3s e atualiza os três
Deployments. Não configure GHCR nem token do 1Password no runner: o Web usa
o token via secret temporário do BuildKit; API e Auth usam o SDK ao iniciar.

Faça o merge em `main` com CI verde. Em **Actions → Deploy production**,
confira o SHA e aprove o job `production` quando o Environment pedir
aprovação. Para disparar novamente o SHA atual sem novo commit, use
`workflow_dispatch` na branch `main`. O wrapper exige checkout limpo na
VPS e busca exatamente o SHA do job.

**VPS, após o rollout:**

```bash
source /opt/braid/env.sh
kubectl -n braid rollout status deployment/api --timeout=300s
kubectl -n braid rollout status deployment/auth --timeout=300s
kubectl -n braid rollout status deployment/web --timeout=300s
kubectl -n braid exec deployment/api -- node scripts/onepassword/check.mjs
kubectl -n braid exec deployment/auth -- node scripts/onepassword/check.mjs
source /opt/braid/release.env
git -C /opt/braid/src rev-parse HEAD
printf 'Release publicada: %s\n' "$SHA"
curl -fsS -o /dev/null -w 'web=%{http_code}\n' "https://timeline.$DOMAIN"
curl -sS -o /dev/null -w 'api=%{http_code}\n' "https://api.$DOMAIN/api/events"
```

O check do SDK imprime nomes das variáveis resolvidas, não seus valores.
Espere Web 200 e `/api/events` 401 sem sessão. Teste login e leitura/gravação
de um evento pelo navegador. Agora atualize o manifesto do Ingress público
`api` para o Service `auth`, porta `3002`, e aplique-o. Confira com
`kubectl -n braid get ingress api -o yaml` que a rota ativa aponta para Auth;
mantenha o manifesto persistente em `/opt/braid/k8s/` igual à rota aplicada.
Se o mobile usa `api.SEUDOMINIO`, teste-o depois dessa troca. Confirme que os pods
novos usam `onepassword-loader`. Só depois trate da retirada dos Secrets e
arquivos de ambiente antigos; confira antes se nenhum workload ou rotina de
backup ainda os consome.

## 6. Operar, rotacionar e diagnosticar

Cada merge em `main` executa o CI e cria um deploy sujeito às regras do
Environment. `/opt/braid/release.env` registra o SHA concluído;
`/opt/braid/previous-release.env` guarda a referência anterior. O backup
fica em `/opt/braid/backups/TIMESTAMP/`. Copie o arquivo cifrado e seu
`.sha256` para fora da VPS e ensaie uma restauração. O script também deixa
dumps e YAML de Secrets em claro nesse diretório root-only; restrinja o acesso
a `/opt/braid/backups/` e defina a retenção desses arquivos. O deploy não reverte
migrations automaticamente; volte uma imagem apenas se o schema for
compatível.

Se uma variável do Environment mudar, reinicie o serviço que a lê:

```bash
kubectl -n braid rollout restart deployment/api
kubectl -n braid rollout restart deployment/auth
```

Execute só o restart necessário. Para `BACKEND_URL` ou
`AUTH_SERVICE_URL` do Web, gere **nova imagem** por
`workflow_dispatch`/deploy, pois o Next incorpora essas URLs no build.
Se rotacionar o token da Service Account, atualize
`/opt/braid/private/onepassword-token`, recrie `onepassword-loader`
com o comando do passo 2 e reinicie API/Auth. Não envie o token ao GitHub.

Se um job falhar, veja o log do Actions e, na VPS:

```bash
kubectl -n braid get pods
kubectl -n braid describe deployment api
kubectl -n braid describe deployment auth
kubectl -n braid describe deployment web
kubectl -n braid logs deployment/api --tail=100
kubectl -n braid logs deployment/auth --tail=100
kubectl -n braid logs deployment/web --tail=100
```

Se o erro for variável ausente, confira o nome e o Environment da Service
Account antes de repetir o job. Se for banco ou migration, compare as
credenciais existentes e o backup; não recrie o volume. Um re-run antigo
pode implantar um SHA antigo: confirme sempre o commit do job.

Referências: [SDK JavaScript do 1Password](https://github.com/1Password/onepassword-sdk-js)
e [Environments e aprovações do GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).