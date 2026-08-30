# Fase 7 — CI/CD com GitHub Actions

## Objetivo

Ao final desta fase, um `git push` para `main` dispara: validação (lint, typecheck,
testes), build da imagem apenas das apps que mudaram, scan de vulnerabilidades, publicação
no GHCR e deploy automático no VPS — sem que o servidor precise compilar nada.

---

## Por que isso existe

O motivo estrutural é o da [ADR-003](adr/003-build-no-ci.md): **um VPS de 4GB não
consegue buildar este monorepo**. `tsc` mais `docker build` consomem 2–4GB de heap.
Executando isso no mesmo servidor que roda Postgres e Traefik, o OOM killer entra em ação
— e ele escolhe a vítima por heurística, geralmente matando o processo de maior consumo,
que costuma ser o seu banco de dados. O resultado é um deploy que derruba a produção.

Os runners do GitHub Actions têm 4 vCPU e 16GB de RAM, e são gratuitos: ilimitados para
repositórios públicos, 2.000 minutos por mês em privados. O build acontece lá, o
resultado é uma imagem no registry, e o servidor só faz `docker compose pull` — que
consome praticamente nada.

Há um segundo motivo, igualmente importante: **reprodutibilidade**. Build feito à mão no
servidor depende do estado daquele servidor naquele momento. Build no CI parte sempre de
um ambiente limpo, com o mesmo lockfile, e produz o mesmo resultado. Quando algo quebrar,
você consegue rastrear.

E um terceiro: o CI é onde as verificações automáticas moram. Lint, typecheck, testes e
scan de vulnerabilidades rodam antes de qualquer coisa chegar ao servidor.

---

## Passo a passo

### 7.1 — Preparar o servidor para receber deploys

🔒 Um usuário dedicado, separado do seu usuário pessoal:

```bash
# 🖥️ servidor
sudo adduser --disabled-password --gecos "" ci
sudo usermod -aG docker ci
sudo mkdir -p /home/ci/.ssh
sudo chmod 700 /home/ci/.ssh
```

`--disabled-password` significa que este usuário **nunca** pode logar por senha, só por
chave.

Gere um par de chaves **exclusivo para o CI** — nunca reuse a sua chave pessoal:

```bash
# 🖥️ servidor
sudo -u ci ssh-keygen -t ed25519 -f /home/ci/.ssh/deploy_key -N "" -C "github-actions-deploy"
```

Sem passphrase (`-N ""`), porque o CI não tem como digitar uma. É por isso que essa chave
precisa ser restrita.

### 7.2 — 🔒 Restringir o que a chave do CI pode fazer

Esta é a mitigação mais importante desta fase.

A chave SSH que você vai colocar nos secrets do GitHub é, potencialmente, a credencial
mais poderosa do seu setup: quem a tiver, tem acesso ao servidor. Se sua conta do GitHub
for comprometida — ou se uma Action de terceiro maliciosa conseguir ler os secrets — essa
chave vaza.

A defesa é limitar o que ela pode executar. O SSH permite amarrar uma chave a um único
comando:

```bash
# 🖥️ servidor
sudo -u ci tee /home/ci/deploy.sh > /dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

cd /opt/stack/apps

# Baixa as imagens novas e recria apenas o que mudou
docker compose pull
docker compose up -d --remove-orphans

# Espera o healthcheck confirmar
sleep 10
docker compose ps

# Limpa imagens antigas para nao encher o disco
docker image prune -af --filter "until=168h"
EOF

sudo -u ci chmod 700 /home/ci/deploy.sh
```

Agora amarre a chave a esse script:

```bash
# 🖥️ servidor
PUBKEY=$(sudo cat /home/ci/.ssh/deploy_key.pub)
echo "command=\"/home/ci/deploy.sh\",no-agent-forwarding,no-port-forwarding,no-pty,no-X11-forwarding $PUBKEY" \
  | sudo -u ci tee /home/ci/.ssh/authorized_keys > /dev/null
sudo chmod 600 /home/ci/.ssh/authorized_keys
```

O que cada restrição faz:

| Opção | Efeito |
|---|---|
| `command="..."` | **Qualquer** comando enviado é ignorado; só o script roda |
| `no-pty` | Sem shell interativo |
| `no-port-forwarding` | A chave não pode ser usada para criar túneis |
| `no-agent-forwarding` | Não encadeia para outros servidores |

Com isso, mesmo que a chave vaze, o atacante consegue apenas... redeployar sua aplicação.
Não consegue shell, não consegue ler arquivos, não consegue tunelar para o Postgres.

⚠️ Lembre-se de adicionar `ci` à diretiva `AllowUsers` do SSH configurada na
[Fase 1](03-fase-1-hardening-do-so.md):

```bash
# 🖥️ servidor
sudo sed -i 's/^AllowUsers deploy$/AllowUsers deploy ci/' /etc/ssh/sshd_config.d/99-hardening.conf
sudo sshd -t && sudo systemctl reload ssh
```

Pegue a chave privada para colocar no GitHub:

```bash
# 🖥️ servidor
sudo cat /home/ci/.ssh/deploy_key
```

### 7.3 — Secrets no GitHub

Em **Settings → Secrets and variables → Actions**, crie:

| Secret | Valor |
|---|---|
| `VPS_HOST` | IP do servidor |
| `VPS_USER` | `ci` |
| `VPS_SSH_KEY` | conteúdo completo da chave privada, incluindo as linhas BEGIN/END |

🔒 Não é preciso criar token do GHCR: o `GITHUB_TOKEN` é gerado automaticamente a cada
execução e expira ao final. É a melhor prática — token de vida curta, escopo mínimo.

### 7.4 — O workflow

`.github/workflows/deploy.yml`:

```yaml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

# Impede dois deploys simultaneos brigando pelo mesmo servidor.
# cancel-in-progress: false porque cancelar um deploy no meio
# deixa o servidor em estado indefinido.
concurrency:
  group: production-deploy
  cancel-in-progress: false

env:
  REGISTRY: ghcr.io

jobs:
  # ---------- 1. Validacao ----------
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Cache do Turborepo
        uses: actions/cache@v4
        with:
          path: .turbo
          key: turbo-${{ github.sha }}
          restore-keys: turbo-

      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test

  # ---------- 2. Detectar apps alteradas ----------
  detect:
    needs: validate
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    outputs:
      apps: ${{ steps.set.outputs.apps }}
      has_changes: ${{ steps.set.outputs.has_changes }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - id: set
        run: |
          if [ "${{ github.event.before }}" = "0000000000000000000000000000000000000000" ]; then
            BASE=$(git rev-list --max-parents=0 HEAD)
          else
            BASE="${{ github.event.before }}"
          fi

          CHANGED=$(git diff --name-only "$BASE" "${{ github.sha }}" -- apps/ \
            | cut -d/ -f2 | sort -u \
            | jq -R -s -c 'split("\n") | map(select(length > 0))')

          # Mudanca em packages/ afeta todas as apps
          if git diff --name-only "$BASE" "${{ github.sha }}" | grep -q '^packages/'; then
            CHANGED=$(ls apps/ | jq -R -s -c 'split("\n") | map(select(length > 0))')
          fi

          echo "apps=$CHANGED" >> "$GITHUB_OUTPUT"
          [ "$CHANGED" = "[]" ] && echo "has_changes=false" >> "$GITHUB_OUTPUT" \
                                || echo "has_changes=true" >> "$GITHUB_OUTPUT"

  # ---------- 3. Build, scan e push ----------
  build:
    needs: detect
    if: needs.detect.outputs.has_changes == 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      security-events: write
    strategy:
      matrix:
        app: ${{ fromJson(needs.detect.outputs.apps) }}
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # Build local primeiro, para escanear ANTES de publicar
      - name: Build para scan
        uses: docker/build-push-action@v6
        with:
          context: .
          file: ./apps/${{ matrix.app }}/Dockerfile
          load: true
          tags: scan-target:${{ github.sha }}
          cache-from: type=gha,scope=${{ matrix.app }}
          cache-to: type=gha,scope=${{ matrix.app }},mode=max

      - name: 🔒 Scan de vulnerabilidades
        uses: aquasecurity/trivy-action@0.28.0
        with:
          image-ref: scan-target:${{ github.sha }}
          format: sarif
          output: trivy-results.sarif
          severity: HIGH,CRITICAL
          exit-code: "0"   # nao bloqueia ainda; ver nota abaixo

      - name: Enviar resultado para o Security tab
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: trivy-results.sarif

      - name: Push para o GHCR
        uses: docker/build-push-action@v6
        with:
          context: .
          file: ./apps/${{ matrix.app }}/Dockerfile
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ github.repository_owner }}/${{ matrix.app }}:${{ github.sha }}
            ${{ env.REGISTRY }}/${{ github.repository_owner }}/${{ matrix.app }}:latest
          cache-from: type=gha,scope=${{ matrix.app }}

  # ---------- 4. Deploy ----------
  deploy:
    needs: [detect, build]
    if: needs.detect.outputs.has_changes == 'true'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Atualizar tags e reiniciar no VPS
        uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: "deploy"   # ignorado: o command= no authorized_keys manda
```

Decisões que valem explicação:

**`concurrency` com `cancel-in-progress: false`** — dois deploys ao mesmo tempo no mesmo
servidor produzem estado imprevisível. Mas cancelar um deploy no meio é pior: containers
parcialmente atualizados. Melhor enfileirar.

**Escanear antes de publicar** — usando `load: true` primeiro, a imagem existe localmente
no runner e pode ser escaneada. Se o scan bloquear, nada foi publicado. Publicar e depois
escanear significa que a imagem vulnerável já está disponível.

**`exit-code: "0"` no Trivy** — começa em modo relatório, sem bloquear. ⚠️ **Mude para
`"1"` depois de resolver o backlog inicial.** Se você começar bloqueando, a primeira
execução vai falhar por CVEs da imagem base que você não pode corrigir hoje, e a tentação
vai ser desligar o scan. Comece relatando, resolva, depois aperte.

**Cache do Turbo por escopo** — `scope=${{ matrix.app }}` evita que apps diferentes
sobrescrevam o cache uma da outra.

**Tag com `github.sha`** — a tag `latest` é conveniente mas ambígua: você nunca sabe qual
commit está rodando. A tag por SHA é a que permite rollback preciso. Publicamos as duas.

**`environment: production`** — habilita, no GitHub, a possibilidade de exigir aprovação
manual antes do deploy. Vale ativar em Settings → Environments quando o projeto ficar
sério.

### 7.5 — 🔒 Configurações de segurança no repositório

Vá em **Settings** e configure:

**Branches → Add rule** para `main`:
- ✅ Require a pull request before merging
- ✅ Require status checks to pass (marque o job `validate`)
- ✅ Do not allow bypassing the above settings

Isso importa porque o workflow roda com acesso aos seus secrets a cada push em `main`.
Sem proteção de branch, qualquer push direto — seu, por engano, ou de alguém com acesso —
executa código com sua chave SSH.

**Code security and analysis:**
- ✅ Secret scanning
- ✅ Push protection — bloqueia o push se detectar algo parecido com credencial. Gratuito
  mesmo em repositórios públicos, e já salvou muita gente.
- ✅ Dependabot alerts e security updates

**Actions → General:**
- Workflow permissions: **Read repository contents** (o mínimo; o workflow pede
  `packages: write` explicitamente onde precisa)
- ✅ Require approval for first-time contributors

**Sua conta:** ative 2FA. Sem isso, todo o resto é decorativo.

### 7.6 — ⚠️ Visibilidade do pacote no GHCR

Este detalhe pega muita gente: **a visibilidade do pacote no GHCR não segue a do
repositório**. Um repositório privado pode ter pacotes públicos, e ninguém avisa.

Verifique em: perfil do GitHub → **Packages** → o pacote → **Package settings** →
**Danger Zone** → Change visibility.

Se for privado, o servidor precisa autenticar para baixar:

```bash
# 🖥️ servidor — com um PAT de escopo read:packages
echo "SEU_PAT" | docker login ghcr.io -u SEU_USUARIO --password-stdin
```

Crie o PAT com escopo **apenas** `read:packages`, e prefira um token com data de
expiração.

### 7.7 — Compose de produção no servidor

`/opt/stack/apps/docker-compose.yml`:

```yaml
services:
  hello-api:
    image: ghcr.io/SEU_USUARIO/hello-api:latest
    container_name: hello-api
    restart: unless-stopped
    expose:
      - "3000"
    env_file:
      - .env
    mem_limit: 192m
    memswap_limit: 192m
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    read_only: true
    tmpfs:
      - /tmp
    networks:
      - edge
      - internal
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.hello.rule=Host(`hello.SEUDOMINIO.com`)"
      - "traefik.http.routers.hello.entrypoints=websecure"
      - "traefik.http.routers.hello.tls.certresolver=letsencrypt"
      - "traefik.http.services.hello.loadbalancer.server.port=3000"
      - "traefik.http.routers.hello.middlewares=rate-limit@file,compress@file"

networks:
  edge:
    external: true
  internal:
    external: true
```

```bash
# 🖥️ servidor
sudo chown -R ci:ci /opt/stack/apps
sudo chmod 600 /opt/stack/apps/.env
```

---

## Por que não fazer diferente

**"Por que não Watchtower, que atualiza containers sozinho?"** — Watchtower observa o
registry e atualiza quando aparece imagem nova. Parece ótimo e tem dois problemas sérios:
você perde controle de *quando* o deploy acontece (pode ser no meio do seu pico de
tráfego), e não há passo de verificação nem rollback. Além disso, ele precisa do socket
do Docker — outro processo privilegiado. Ver [ADR-007](adr/007-deploy-ssh.md).

**"Por que não GitOps com ArgoCD ou Flux?"** — É o modelo mais seguro: um agente dentro
do servidor observa o repositório e aplica mudanças, então nenhuma credencial de servidor
sai de casa. É o padrão em ambientes maduros. O problema é que ArgoCD e Flux são
ferramentas de Kubernetes; o equivalente para Compose seria montar algo caseiro. Fica
como evolução natural se você voltar ao Kubernetes.

**"Por que não `rsync` do código e build no servidor?"** — É o caminho tradicional, e é
exatamente o que não funciona com 4GB. Ver [ADR-003](adr/003-build-no-ci.md).

**"Por que não OIDC em vez de chave SSH?"** — Excelente pergunta, e a resposta merece
precisão: OIDC do GitHub Actions elimina credenciais de longa duração ao emitir tokens
efêmeros — mas ele funciona contra provedores que sabem validar esses tokens (AWS, GCP,
Azure, HashiCorp Vault). **Um VPS com SSH não tem esse mecanismo nativamente.** Existem
caminhos (um broker que troque o token OIDC por um certificado SSH de curta duração), mas
é complexidade considerável. A restrição por `command=` da seção 7.2 é a mitigação
prática e eficaz para este cenário.

**"Por que não usar o Turborepo Remote Cache?"** — A Vercel oferece gratuitamente e é
mais rápido que o cache do GitHub Actions. Usamos `actions/cache` para não adicionar
dependência externa. Se seus builds passarem de 3–4 minutos, vale ativar — a configuração
é uma variável de ambiente.

---

## Como garantir que está certo

**O workflow roda:** faça um push e acompanhe em Actions. Esperado: `validate` verde,
`detect` listando `["hello-api"]`, `build` publicando, `deploy` verde.

**A detecção de mudanças funciona** — mude apenas o README e faça push:
→ Esperado: `validate` roda, `detect` retorna `[]`, e `build`/`deploy` são pulados. Se
buildar mesmo assim, o filtro `-- apps/` não está funcionando.

**A imagem chegou ao registry:**

```bash
# 💻 local
docker manifest inspect ghcr.io/SEU_USUARIO/hello-api:latest
```

**O deploy chegou ao servidor:**

```bash
# 🖥️ servidor
docker compose -f /opt/stack/apps/docker-compose.yml ps
docker inspect hello-api --format '{{.Config.Image}}'
docker inspect hello-api --format '{{.State.StartedAt}}'
```
→ Esperado: horário do último deploy.

🔒 **A chave do CI está mesmo restrita** — o teste mais importante desta fase:

```bash
# 💻 local — usando a chave privada do CI
ssh -i chave_do_ci ci@SEU_IP "cat /etc/passwd"
```
→ Esperado: o comando é **ignorado** e o script de deploy roda no lugar. Se o conteúdo do
`/etc/passwd` aparecer, o `command=` não está aplicado, e a chave nos secrets do GitHub é
uma chave de shell completo.

```bash
# 💻 local
ssh -i chave_do_ci ci@SEU_IP
```
→ Esperado: executa o deploy e desconecta. Nunca deve abrir um shell.

🔒 **O usuário `ci` não consegue ler segredos que não são dele:**

```bash
# 🖥️ servidor
sudo -u ci cat /opt/stack/data/.env
```
→ Esperado: `Permission denied`.

🔒 **Nenhum segredo aparece no log do workflow** — abra qualquer execução e procure. O
GitHub mascara valores de secrets automaticamente, mas apenas correspondências exatas: um
segredo transformado (codificado em base64, por exemplo) **não é mascarado**. Nunca faça
`echo` de variáveis de ambiente em workflows.

**A visibilidade do pacote está como você espera:** confira em Package settings, como
descrito em 7.6.

**Rollback funciona** — pratique antes de precisar:

```bash
# 🖥️ servidor
docker compose -f /opt/stack/apps/docker-compose.yml down hello-api
docker run -d --name hello-api-old ghcr.io/SEU_USUARIO/hello-api:SHA_ANTERIOR
```
Ou, melhor, edite a tag no compose para o SHA anterior e rode `docker compose up -d`. O
[runbook](12-runbook-operacao.md) detalha o procedimento.

---

## Armadilhas comuns

**`ERR_PNPM_OUTDATED_LOCKFILE`** — o `pnpm-lock.yaml` não foi commitado depois de mudar
dependências. `--frozen-lockfile` recusa, e está certo em recusar.

**Deploy "com sucesso" mas nada mudou.** A tag `latest` foi publicada mas o servidor tem
uma cópia em cache. `docker compose pull` deveria resolver; se não resolver, o problema é
o `imagePullPolicy` implícito — use tags por SHA para eliminar a ambiguidade.

**`permission denied` ao conectar como `ci`.** As permissões de `/home/ci/.ssh` (700) e
`authorized_keys` (600) precisam estar exatas, e o dono precisa ser `ci`.

**A chave privada no secret perdeu a formatação.** Cole o arquivo **completo**, incluindo
`-----BEGIN OPENSSH PRIVATE KEY-----` e `-----END-----`, com as quebras de linha. Um
único caractere a mais ou a menos invalida.

**Disco enchendo de imagens antigas.** O `docker image prune` no script de deploy resolve.
Sem ele, cada deploy deixa uma imagem órfã de ~150MB, e em dois meses o disco acaba.

**Actions de terceiros sem versão fixa.** `uses: alguem/acao@main` executa o que estiver
no branch naquele momento — se a Action for comprometida, seus secrets vazam. Fixe por
tag (`@v1.2.0`) ou, idealmente, por SHA do commit.

**Deploy sem verificação.** Se a imagem nova estiver quebrada, o compose sobe o container,
o healthcheck falha, e o Traefik para de rotear — resultado: aplicação fora do ar sem
aviso. Melhoria: fazer o script de deploy verificar o healthcheck e reverter
automaticamente se falhar.

---

## Para estudar

- 🆓 **GitHub Actions docs: "Understanding GitHub Actions"** — o modelo de jobs, steps e
  runners. Comece por aqui.
- 🆓 **GitHub Actions: "Security hardening for GitHub Actions"** — a página oficial sobre
  secrets, permissões de `GITHUB_TOKEN` e riscos de Actions de terceiros. Leitura
  obrigatória desta fase.
- 🆓 **`man sshd`, seção AUTHORIZED_KEYS FILE FORMAT** — documenta todas as restrições que
  usamos (`command=`, `no-pty`, etc.). Vale ler; há mais opções úteis.
- 🆓 **Docker: "Build cache" e a documentação do `docker/build-push-action`** — as
  estratégias de cache (`gha`, `registry`, `inline`) e quando usar cada uma.
- 🆓 **Trivy docs** — como interpretar o relatório e ignorar CVEs sem correção disponível
  via `.trivyignore`.
- 🆓 **Turborepo: "Continuous Integration"** — o guia oficial de cache no CI.
- 💰 **"Continuous Delivery"** (Humble & Farley) — o livro que definiu a disciplina.
  Denso, mas os capítulos sobre pipeline de deploy e gestão de configuração explicam o
  *porquê* de tudo nesta fase.
