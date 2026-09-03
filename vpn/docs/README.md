# Spec: Time Composure em produção num VPS de 4 GiB

> **Este é o plano v1, mantido como histórico.** Ele foi dimensionado para um VPS de
> 4 GiB, e três das suas decisões — Compose em vez de Kubernetes, Grafana Cloud em vez de
> stack local, e deploy push por SSH — mudam de resposta com 16 GiB. O plano corrente é o
> [v2](../v2/README.md), que assume o monorepo configurado e a aplicação já rodando com
> PostgreSQL e Redis. As ADRs substituídas são [001](adr/001-docker-compose-vs-k3s.md),
> [005](adr/005-victoriametrics.md) e [007](adr/007-deploy-ssh.md); o restante deste
> documento continua sendo a referência do raciocínio original.

Guia de estudo e execução para colocar o monorepo existente no ar usando Docker
Compose, Traefik, PostgreSQL, Redis e Grafana Cloud. O servidor recebe duas aplicações:

- `apps/web` — Next.js 16, único serviço público no primeiro deploy;
- `apps/api` — NestJS 11, acessível pelo Next apenas na rede Docker.

O app Expo não roda no VPS. Os serviços futuros `auth-api` e `jobs-api` não existem
ainda: esta spec reserva capacidade para eles, mas não cria containers vazios.

## Estados da arquitetura

### Estado atual do código

Web e API usam Firebase Auth; a API ainda persiste eventos e tags no Firestore.

### Primeiro deploy

O comportamento atual é preservado. PostgreSQL e Redis já ficam instalados, protegidos,
monitorados e com restauração testada, porém a API ainda não recebe `DATABASE_URL` nem
`REDIS_URL`.

### Evolução futura

1. migrar persistência de Firestore para PostgreSQL em plano próprio;
2. implementar `auth-api` e substituir gradualmente Firebase Auth;
3. implementar `jobs-api`/worker sobre Redis;
4. publicar a API por HTTPS para o app mobile.

Nenhuma dessas evoluções bloqueia o primeiro deploy.

## Estado das fases

| Fase | Documento | Status |
|---|---|---|
| — | [Convenções](00-convencoes.md) | Referência |
| — | [Arquitetura e orçamento](01-arquitetura-e-orcamento.md) | Referência |
| 0 | [Diagnóstico do VPS](02-fase-0-diagnostico-e-limpeza.md) | Não iniciada |
| 1 | [Hardening do SO](03-fase-1-hardening-do-so.md) | Não iniciada |
| 2 | [Docker, redes e limites](04-fase-2-docker.md) | Não iniciada |
| 3 | [Preparação do monorepo existente](05-fase-3-monorepo-local.md) | Não iniciada |
| 4 | [Imagens Docker de web e API](06-fase-4-imagens-docker.md) | Não iniciada |
| 5 | [Traefik e TLS](07-fase-5-traefik-e-tls.md) | Não iniciada |
| 6 | [PostgreSQL, Redis e backup](08-fase-6-postgres-e-redis.md) | Não iniciada |
| 7 | [CI/CD com GitHub Actions](09-fase-7-cicd-github-actions.md) | Não iniciada |
| 8 | [Grafana Cloud e Alloy](10-fase-8-observabilidade.md) | Não iniciada |
| — | [Checklist de segurança](11-seguranca-checklist.md) | Transversal |
| — | [Runbook](12-runbook-operacao.md) | Referência |

## Arquitetura do primeiro deploy

```text
Internet -> :80/:443 -> Traefik -> web:3000 -> api:3001 -> Firebase
                                             |
                                             +-- sem conexão inicial com Postgres/Redis

Alloy -> Grafana Cloud
Postgres/Redis -> rede data, sem portas públicas
```

Somente Traefik publica portas. O Next encaminha `/api/*` para `http://api:3001`.
PostgreSQL e Redis não são dependências de readiness da API enquanto continuarem
ociosos.

## Ordem de execução

```text
Fase 0 -> Fase 1 -> Fase 2
                         +-> Fase 3 -> Fase 4 -+
                         +-> Fase 5 ----------+-> Fase 7 -> Fase 8
                         +-> Fase 6 ----------+
```

As fases 3 e 4 rodam na máquina Windows. As fases 0–2, 5, 6 e 8 rodam no VPS.
A fase 7 conecta repositório, GHCR e servidor.

## Regras de ouro

1. O VPS nunca compila o monorepo; ele só baixa imagens prontas.
2. Apenas Traefik publica portas Docker, e apenas 22, 80 e 443 ficam abertas no host.
3. Todo container tem `mem_limit` e heap coerente com esse limite.
4. PostgreSQL não recebe dado real antes de backup e restore externos funcionarem.
5. Segredos nunca entram no git, em build args ou em camadas de imagem.
6. O mobile não acessa a API até existir uma etapa explícita de exposição pública.
7. Uma fase só termina quando seus testes e verificações tiverem sido executados.

As decisões de arquitetura vivem em [`adr/`](adr/) e os critérios de aceite resumidos
em [`checklists/`](checklists/).
