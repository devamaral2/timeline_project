# Checklist — Fases 5 a 8 (stack)

## Fase 5 — Traefik

- [ ] Somente Traefik publica 80/443
- [ ] `exposedByDefault=false`
- [ ] Web tem router, middleware e `traefik.docker.network=edge`
- [ ] API não tem router, labels de exposição ou `ports:`
- [ ] Certificado staging validado antes de produção
- [ ] HSTS habilitado somente após TLS válido
- [ ] Scan externo não encontra 3000, 3001, 5432, 6379 ou 12345

## Fase 6 — PostgreSQL e Redis

- [ ] Rede `data` é interna
- [ ] PostgreSQL 16 limitado a 384 MiB e `max_connections=30`
- [ ] Redis 7 limitado a 192 MiB, `maxmemory=128mb`, AOF e `noeviction`
- [ ] Nenhum dos dois publica porta
- [ ] Database `timeline` criada
- [ ] Roles admin, `timeline_migrator` e `timeline_app` separadas
- [ ] Runtime não é superusuário nem dono do schema
- [ ] API ainda não recebe `DATABASE_URL` ou `REDIS_URL`
- [ ] Backup externo contém globals, database e Redis
- [ ] Restore externo concluído em ambiente descartável
- [ ] Data, caminho remoto e resultado do restore registrados

## Fase 7 — CI/CD

- [ ] Validação usa `npm run --silent test:ai`, typecheck e build
- [ ] Matriz Docker contém somente `web` e `api`
- [ ] Mudança exclusiva no mobile não builda imagens
- [ ] Mudança de servidor publica as duas imagens com o mesmo SHA
- [ ] Valores `NEXT_PUBLIC_FIREBASE_*` são Actions Variables
- [ ] Segredos de runtime existem somente no VPS
- [ ] Trivy roda antes do push
- [ ] Deploy espera healthchecks e reverte os dois serviços em falha
- [ ] Chave SSH do CI usa comando forçado e sem forwarding
- [ ] Rollback por SHA testado

## Fase 8 — Grafana Cloud

- [ ] Alloy fixado em versão testada e limitado a 192 MiB
- [ ] Tokens têm apenas permissão de escrita e arquivo modo `600`
- [ ] Host, containers e `/metrics` da API chegam ao Grafana Cloud
- [ ] Logs web/API chegam sem tokens ou dados pessoais
- [ ] `/metrics` e UI do Alloy não são públicos
- [ ] Sonda externa verifica `/health` do web
- [ ] Alertas de disco, memória, API, web, swap e ingestão configurados
- [ ] Falha e rotação de token testadas
- [ ] Máximos de RAM registrados durante sete dias
- [ ] Folga real permanece acima de 1 GiB e não há swap persistente
