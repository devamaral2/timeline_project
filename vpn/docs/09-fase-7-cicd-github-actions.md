# Fase 7 — CI/CD de web e API

## Objetivo

Validar o monorepo inteiro em cada PR e, em pushes relevantes para o servidor, construir,
escanear e publicar exatamente duas imagens: `web` e `api`. O VPS baixa as imagens e
recria containers; nunca executa `pnpm install` ou build.

Mudança exclusiva em `apps/mobile` roda validação, mas não inicia build Docker nem deploy.

## 7.1 — Modelo de release

Web e API recebem a mesma tag imutável, o SHA do commit. Quando qualquer arquivo de
`apps/web`, `apps/api`, `packages` ou configuração raiz de build muda, as duas imagens são
reconstruídas. Para o volume atual, baixar uma imagem extra custa menos que manter lógica
de tags parciais e rollback inconsistente.

O Compose usa uma variável única:

```dotenv
RELEASE_SHA=SHA_DO_COMMIT
```

Rollback significa voltar essa variável ao SHA anterior e executar `docker compose up`.

## 7.2 — Variáveis e segredos do GitHub

Secrets:

| Nome | Uso |
|---|---|
| `VPS_HOST` | endereço SSH |
| `VPS_USER` | usuário restrito de deploy |
| `VPS_SSH_KEY` | chave exclusiva do CI |

Actions Variables, porque são públicas e entram no bundle web:

```text
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

Não crie secrets de CI para Firebase Admin, OpenRouter, PostgreSQL ou Redis. Esses valores
ficam somente no VPS e nunca participam do build.

## 7.3 — Workflow

`.github/workflows/deploy.yml`:

```yaml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: production-deploy
  cancel-in-progress: false

env:
  REGISTRY: ghcr.io

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: npm run --silent test:ai
      - run: pnpm turbo run typecheck
      - run: pnpm turbo run build

  detect:
    needs: validate
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    outputs:
      deploy: ${{ steps.changes.outputs.deploy }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - id: changes
        shell: bash
        run: |
          before='${{ github.event.before }}'
          if [[ "$before" =~ ^0+$ ]]; then
            before="$(git rev-list --max-parents=0 HEAD)"
          fi
          changed="$(git diff --name-only "$before" '${{ github.sha }}')"
          if grep -Eq '^(apps/(web|api)/|packages/|package.json$|pnpm-lock.yaml$|pnpm-workspace.yaml$|turbo.json$|tsconfig.base.json$)' <<<"$changed"; then
            echo 'deploy=true' >> "$GITHUB_OUTPUT"
          else
            echo 'deploy=false' >> "$GITHUB_OUTPUT"
          fi

  build:
    needs: detect
    if: needs.detect.outputs.deploy == 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      security-events: write
    strategy:
      matrix:
        app: [web, api]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build para scan
        shell: bash
        run: |
          build_args=()
          if [ "${{ matrix.app }}" = web ]; then
            build_args+=(--build-arg BACKEND_URL=http://api:3001)
            build_args+=(--build-arg NEXT_PUBLIC_FIREBASE_API_KEY=${{ vars.NEXT_PUBLIC_FIREBASE_API_KEY }})
            build_args+=(--build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${{ vars.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN }})
            build_args+=(--build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID=${{ vars.NEXT_PUBLIC_FIREBASE_PROJECT_ID }})
            build_args+=(--build-arg NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${{ vars.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET }})
            build_args+=(--build-arg NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${{ vars.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID }})
            build_args+=(--build-arg NEXT_PUBLIC_FIREBASE_APP_ID=${{ vars.NEXT_PUBLIC_FIREBASE_APP_ID }})
          fi
          docker buildx build . \
            -f apps/${{ matrix.app }}/Dockerfile \
            --load -t scan-target:${{ matrix.app }}-${{ github.sha }} \
            --cache-from type=gha,scope=${{ matrix.app }} \
            "${build_args[@]}"

      - uses: aquasecurity/trivy-action@0.28.0
        with:
          image-ref: scan-target:${{ matrix.app }}-${{ github.sha }}
          format: sarif
          output: trivy-${{ matrix.app }}.sarif
          severity: HIGH,CRITICAL
          exit-code: "0"

      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: trivy-${{ matrix.app }}.sarif

      - name: Push por SHA e latest
        shell: bash
        run: |
          build_args=()
          if [ "${{ matrix.app }}" = web ]; then
            build_args+=(--build-arg BACKEND_URL=http://api:3001)
            build_args+=(--build-arg NEXT_PUBLIC_FIREBASE_API_KEY=${{ vars.NEXT_PUBLIC_FIREBASE_API_KEY }})
            build_args+=(--build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${{ vars.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN }})
            build_args+=(--build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID=${{ vars.NEXT_PUBLIC_FIREBASE_PROJECT_ID }})
            build_args+=(--build-arg NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${{ vars.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET }})
            build_args+=(--build-arg NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${{ vars.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID }})
            build_args+=(--build-arg NEXT_PUBLIC_FIREBASE_APP_ID=${{ vars.NEXT_PUBLIC_FIREBASE_APP_ID }})
          fi
          docker buildx build . \
            -f apps/${{ matrix.app }}/Dockerfile \
            --push \
            -t ${{ env.REGISTRY }}/${{ github.repository_owner }}/${{ matrix.app }}:${{ github.sha }} \
            -t ${{ env.REGISTRY }}/${{ github.repository_owner }}/${{ matrix.app }}:latest \
            --cache-from type=gha,scope=${{ matrix.app }} \
            --cache-to type=gha,scope=${{ matrix.app }},mode=max \
            "${build_args[@]}"

  deploy:
    needs: [detect, build]
    if: needs.detect.outputs.deploy == 'true'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: "deploy ${{ github.sha }}"
```

Após resolver o backlog inicial de CVEs, mude o Trivy para `exit-code: "1"`.

## 7.4 — Compose de produção

`/opt/stack/apps/.env.images`:

```dotenv
REGISTRY_PREFIX=ghcr.io/SEU_USUARIO
RELEASE_SHA=SHA_INICIAL
```

`/opt/stack/apps/api.env`, modo `600`, contém apenas Firebase Admin, OpenRouter e config
da API atual. Não contém `DATABASE_URL` nem `REDIS_URL`.

`/opt/stack/apps/docker-compose.yml`:

```yaml
services:
  api:
    image: ${REGISTRY_PREFIX}/api:${RELEASE_SHA}
    container_name: api
    restart: unless-stopped
    env_file: [api.env]
    environment:
      NODE_ENV: production
      API_HOST: 0.0.0.0
      PORT: 3001
    expose: ["3001"]
    networks: [edge, data]
    mem_limit: 256m
    memswap_limit: 256m
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    logging:
      options: {max-size: "10m", max-file: "3"}

  web:
    image: ${REGISTRY_PREFIX}/web:${RELEASE_SHA}
    container_name: web
    restart: unless-stopped
    environment:
      BACKEND_URL: http://api:3001
      HOSTNAME: 0.0.0.0
      PORT: 3000
    expose: ["3000"]
    depends_on:
      api: {condition: service_healthy}
    networks: [edge]
    mem_limit: 384m
    memswap_limit: 384m
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    logging:
      options: {max-size: "10m", max-file: "3"}
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=edge"
      - "traefik.http.routers.web.rule=Host(`app.SEUDOMINIO.com`)"
      - "traefik.http.routers.web.entrypoints=websecure"
      - "traefik.http.routers.web.tls.certresolver=letsencrypt"
      - "traefik.http.routers.web.middlewares=security-headers@file,rate-limit@file,compress@file"
      - "traefik.http.services.web.loadbalancer.server.port=3000"

networks:
  edge: {external: true}
  data: {external: true}
```

## 7.5 — Deploy e rollback restritos

O comando `deploy SHA` deve:

1. validar SHA hexadecimal de 40 caracteres;
2. salvar o `RELEASE_SHA` anterior;
3. fazer pull das duas imagens por SHA;
4. atualizar `.env.images` de forma atômica;
5. executar `docker compose --env-file .env.images up -d`;
6. aguardar `api` e `web` ficarem healthy;
7. restaurar o SHA anterior se qualquer healthcheck falhar;
8. manter imagens recentes para rollback e limpar apenas as antigas.

A chave do CI em `authorized_keys` usa `command="/usr/local/bin/deploy-from-ci"`, sem PTY,
forwarding ou shell arbitrário.

## Como garantir que está certo

- PR exclusiva de mobile: `validate` executa; `build` e `deploy` ficam skipped.
- Mudança em package compartilhado: matriz publica `web` e `api` com o mesmo SHA.
- `docker inspect web` e `docker inspect api` mostram o SHA implantado.
- `docker inspect api` não mostra URLs PostgreSQL/Redis.
- Apenas o web possui labels Traefik.
- Um SHA inválido é recusado pelo script restrito.
- Um healthcheck forçado a falhar restaura ambos os serviços ao SHA anterior.

## Armadilhas comuns

**Usar `latest` para rollback.** `latest` é mutável; somente SHA identifica uma release.

**Detectar qualquer pasta em `apps/`.** Isso inclui mobile e procura um Dockerfile que não
existe. A matriz é explicitamente `[web, api]`.

**Enviar `.env` ao CI.** Build não precisa dos segredos de runtime. Mantenha-os no VPS.
