# Checklist — Fases 5 a 8 (stack no servidor)

## Fase 5 — Traefik e TLS

### Etapa A — sem domínio

- [ ] `/opt/stack/traefik/` criado com `dynamic/` e `certs/`
- [ ] 🔴 `acme.json` com `chmod 600` (o Traefik recusa iniciar sem isso)
- [ ] `traefik.yml` com entrypoints 80 e 443, redirect configurado
- [ ] 🔴 `exposedByDefault: false`
- [ ] 🔴 `api.insecure: false`
- [ ] `accessLog` filtrado por status 400–599
- [ ] Middlewares criados: security-headers, rate-limit, rate-limit-strict, compress
- [ ] `internal-auth` com hash gerado por `htpasswd -nbB` (cifrões duplicados no YAML)
- [ ] ⚠️ Linhas de HSTS **comentadas** nesta etapa
- [ ] Traefik sobe sem erro nos logs
- [ ] Rota da `hello-api` declarada por labels
- [ ] `/metrics` **não** roteado publicamente
- [ ] Acesso validado por túnel SSH (`ssh -L 8443:localhost:443`)
- [ ] 🔴 Dashboard inacessível na porta 8080 de fora
- [ ] 🔴 Container sem `traefik.enable` não é exposto (teste do nginx)
- [ ] Redirect HTTP → HTTPS retornando 301
- [ ] Headers de segurança presentes; `Server`/`X-Powered-By` ausentes
- [ ] Rate limit devolvendo 429 sob carga

### Etapa B — com domínio

- [ ] Domínio registrado: ________
- [ ] Registros A criados (@, hello, grafana, traefik) com TTL 300
- [ ] 🔴 Propagação confirmada (`nslookup`) **antes** de pedir certificado
- [ ] Cloudflare configurado (proxy ativo) — IP do VPS oculto
- [ ] `forwardedHeaders.trustedIPs` com as faixas do Cloudflare
- [ ] 🔴 Resolver **staging** testado primeiro
- [ ] `Certificate obtained` visto nos logs
- [ ] Trocado para resolver de produção (arquivos `acme.json` distintos)
- [ ] HSTS descomentado e ativo
- [ ] SSL Labs A ou A+ — nota: ________

## Fase 6 — Postgres e Redis

- [ ] `.env` gerado com senhas aleatórias, `chmod 600`
- [ ] `.env.example` criado e versionado (sem valores reais)
- [ ] `postgresql.conf` com tuning para 4GB
- [ ] `shm_size: 128mb` definido
- [ ] `--data-checksums` no `POSTGRES_INITDB_ARGS` (decidido agora, não depois)
- [ ] Redis com `--requirepass`, `maxmemory`, `appendonly`
- [ ] 🔴 `FLUSHALL`, `FLUSHDB`, `CONFIG` renomeados
- [ ] Política de `maxmemory` adequada ao uso (cache → lru; fila → noeviction)
- [ ] Ambos em rede `internal`, sem `ports:` público
- [ ] Healthchecks passando
- [ ] Usuário `hello_app` criado sem privilégios administrativos
- [ ] `ALTER DEFAULT PRIVILEGES` aplicado
- [ ] `SHOW shared_buffers` retorna o valor customizado (config foi aplicada)
- [ ] 🔴 `redis-cli ping` retorna `NOAUTH`
- [ ] 🔴 Teste externo: 5432 e 6379 recusam conexão
- [ ] `/ready` retorna `{"postgres":true,"redis":true}`
- [ ] `/ready` retorna 503 e `/health` retorna 200 com o Postgres parado
- [ ] rclone configurado para o bucket
- [ ] `backup.sh` criado com `set -euo pipefail` e verificação de tamanho
- [ ] Cron agendado (03:00)
- [ ] 🔴 **Restauração testada a partir do bucket** — data: ________

## Fase 7 — CI/CD

- [ ] Usuário `ci` criado com `--disabled-password`, no grupo `docker`
- [ ] Chave exclusiva do CI gerada (não reusar a pessoal)
- [ ] 🔴 `command="/home/ci/deploy.sh"` + `no-pty` + `no-port-forwarding`
- [ ] `ci` adicionado ao `AllowUsers` do sshd
- [ ] Secrets criados no GitHub: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
- [ ] Workflow com `concurrency` e `cancel-in-progress: false`
- [ ] Job `validate` rodando lint, typecheck e testes
- [ ] Detecção de apps alteradas funcionando
- [ ] Mudança em `packages/` dispara rebuild de todas as apps
- [ ] Trivy escaneando **antes** do push
- [ ] Tags publicadas por SHA **e** `latest`
- [ ] 🔴 Branch protection em `main`
- [ ] 🔴 Secret scanning + push protection ativos
- [ ] Dependabot configurado (npm, docker, github-actions)
- [ ] 2FA ativo na conta
- [ ] 🔴 Visibilidade do pacote no GHCR conferida
- [ ] `docker image prune` no script de deploy
- [ ] 🔴 Teste: `ssh -i chave_ci ci@IP "cat /etc/passwd"` é ignorado
- [ ] Push no README **não** dispara build
- [ ] Rollback ensaiado

## Fase 8 — Observabilidade

- [ ] `.env` do Grafana com senha aleatória
- [ ] Hash bcrypt do basic auth gerado (cifrões duplicados)
- [ ] 🔴 `retention_period: 168h` no Loki
- [ ] Compactor com `retention_enabled: true`
- [ ] `config.alloy` com scrape de infra e apps + coleta de logs
- [ ] `scrape_interval: 30s`
- [ ] Datasources provisionados por arquivo
- [ ] `--memory.allowedPercent=60` no VictoriaMetrics
- [ ] Todos com `mem_limit` conforme o orçamento
- [ ] Alloy nas redes `observability` **e** `edge`
- [ ] 🔴 Grafana com dupla autenticação (Traefik + login)
- [ ] Dashboards importados (1860, 19792, 13639, 193)
- [ ] Painel de swap em uso criado
- [ ] Alerta de disco >80% criado
- [ ] Alerta de memória de container >90% criado
- [ ] Alerta de app fora do ar criado
- [ ] Contact point configurado (Telegram/Discord — não e-mail pelo VPS)
- [ ] 🔴 **Alerta testado de verdade** (fallocate) — notificação recebida
- [ ] Métricas da `hello-api` chegando ao VictoriaMetrics
- [ ] Logs chegando ao Loki
- [ ] 🔴 Teste externo: 8428, 3100, 8080, 9100 recusam conexão
- [ ] `docker stats` total abaixo de 2.5GB — real: ________
- [ ] `free -h` mostrando swap em 0 ou próximo
