# Checklist — Fases 3 a 5 (migração e corte)

## Fase 3 — Ingress e TLS

- [ ] cert-manager com os três pods `Running`
- [ ] Dois `ClusterIssuer` com `READY: True`
- [ ] 🔴 Todo Ingress nasce apontando para o issuer de **staging**
- [ ] 🔴 `stsSeconds: 0` — HSTS desligado até a Fase 5
- [ ] Traefik do cluster em `hostPort` 8080/8443
- [ ] 🔴 `nmap` externo: 8080 e 8443 `filtered`
- [ ] 🔴 Portas 80 e 443 ainda no Traefik do Compose, sem conflito
- [ ] Middlewares `security-headers` e `rate-limit` criados
- [ ] Ponte `bridge.yml` funcionando: navegador → Compose → cluster → Grafana
- [ ] `insecureSkipVerify` **anotado** na lista de pendências da Fase 5
- [ ] 🔴 `https://app.SEUDOMINIO.com/health` continua respondendo 200 (produção intacta)

## Fase 4 — Dados no cluster

- [ ] 🔴 Backup fresco, validado e restaurado a partir do armazenamento externo
- [ ] 🔴 Procedimento de volta escrito **antes** do corte
- [ ] Janela combinada
- [ ] StatefulSets de PostgreSQL e Redis com PVC `Bound`
- [ ] 🔴 `qosClass` de `postgres-0` e `redis-0` é `Guaranteed`
- [ ] `livenessProbe` do banco com atraso inicial alto e período longo
- [ ] `postgresql.conf` com os valores de 16 GiB (`shared_buffers=512MB`, `max_connections=60`)
- [ ] Redis com `noeviction` e os comandos perigosos renomeados
- [ ] Databases `litellm` e `timeline_staging` criadas, com roles próprias
- [ ] 🔴 `timeline_app` sem superusuário e sem ser dono do schema
- [ ] 🔴 Contagem de linhas e `max(created_at)` batem com o banco do Compose
- [ ] 🔴 `pg_restore` executado com `--exit-on-error`
- [ ] Postgres do Compose **parado** após a conferência
- [ ] CronJob de backup com `concurrencyPolicy: Forbid` e histórico limitado
- [ ] Alerta de job falhado e de ausência de sucesso em 26h
- [ ] 🔴 Segundo restore, a partir do externo, depois do corte — registrado com data
- [ ] 🔴 `nmap` externo: 5432 e 6379 `filtered`
- [ ] NetworkPolicy testada: pod com label `web` **não** alcança o Postgres

## Fase 5 — web, API e o corte

- [ ] Deployments com `maxSurge: 1` e `maxUnavailable: 0`
- [ ] `startupProbe`, `readinessProbe` e `livenessProbe` distintas
- [ ] `NODE_OPTIONS` alinhado ao limite de memória de cada container
- [ ] `securityContext` completo: não-root, sem escalonamento, capabilities derrubadas
- [ ] 🔴 NetworkPolicy default-deny aplicada **junto** com as regras de DNS e egress 443
- [ ] HPA configurado, com `maxReplicas` conferido contra o orçamento de RAM
- [ ] 🔴 Teste manual por `port-forward` **antes** de trocar as portas
- [ ] 🔴 Compose de aplicação e Traefik do Compose parados
- [ ] Traefik do cluster em 80/443
- [ ] 🔴 Certificado de produção emitido e válido, host a host
- [ ] 🔴 HSTS ligado **somente** depois do certificado de produção
- [ ] 🔴 `bridge.yml` e `insecureSkipVerify` removidos
- [ ] 🔴 Rollout com tráfego contínuo: **só 200**, nenhum 502 ou 503
- [ ] `rollout undo` executado de verdade ao menos uma vez
- [ ] 🔴 `nmap` externo: apenas 22, 80 e 443 abertas — 8443 incluída no que fechou
- [ ] Logs sem token e sem dado pessoal
