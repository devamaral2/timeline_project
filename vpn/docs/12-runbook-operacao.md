# 12 — Runbook de operação

Procedimentos para o primeiro deploy: web e API em Firebase/Firestore, PostgreSQL e Redis
ociosos, telemetria enviada por Alloy ao Grafana Cloud.

## Diagnóstico inicial

```bash
free -h
df -h /
docker compose --env-file /opt/stack/apps/.env.images -f /opt/stack/apps/docker-compose.yml ps
docker stats --no-stream
journalctl -u docker --since '30 minutes ago' --no-pager
```

Antes de reiniciar, registre qual container falhou, exit code, uso de RAM, espaço livre e
últimas linhas de log. Reiniciar primeiro apaga evidência.

## Site não responde

Teste de fora para dentro:

```bash
dig +short app.SEUDOMINIO.com
curl -vI https://app.SEUDOMINIO.com/health
```

No VPS:

```bash
sudo ufw status verbose
ss -tulpn | grep -E ':80 |:443 '
docker logs traefik --tail 100
docker inspect web --format '{{json .State.Health}}'
docker exec web node -e "fetch('http://127.0.0.1:3000/health').then(async r=>console.log(r.status,await r.text()))"
```

Se o web está saudável, teste a cadeia web→API:

```bash
docker exec web node -e "fetch('http://api:3001/health').then(async r=>console.log(r.status,await r.text()))"
docker inspect api --format '{{json .State.Health}}'
docker logs api --tail 100
docker network inspect edge
```

Erros `ECONNREFUSED 127.0.0.1:3001` dentro do web indicam `BACKEND_URL` construído ou
configurado errado. A URL em container é `http://api:3001`.

## Container reiniciando

```bash
docker inspect CONTAINER --format 'exit={{.State.ExitCode}} oom={{.State.OOMKilled}} error={{.State.Error}}'
docker logs CONTAINER --tail 200
docker inspect CONTAINER --format 'limit={{.HostConfig.Memory}} swap={{.HostConfig.MemorySwap}}'
```

- exit 137/OOM: capture `docker stats`, reverta a release se começou após deploy e só
  aumente limite depois de medir a folga global;
- API falhando no bootstrap: verifique Firebase Admin/OpenRouter em `api.env`;
- web saudável mas API indisponível: inspecione rede `edge` e DNS `api`;
- PostgreSQL/Redis fora: afeta backup e prontidão da infraestrutura, mas ainda não deve
  derrubar readiness da API no primeiro deploy.

## Disco cheio

```bash
df -h /
docker system df
sudo du -xhd1 /var/lib/docker /opt/stack /opt/backups 2>/dev/null | sort -h
```

Investigue logs sem rotação, imagens antigas, backups locais além de sete dias e volumes
de PostgreSQL/Redis. Não existe volume local de Loki no desenho padrão.

Remova apenas imagens sem uso depois de confirmar que os dois SHAs mais recentes de
release continuam disponíveis para rollback.

## Servidor lento ou swap em uso

```bash
free -h
vmstat 1 10
docker stats --no-stream
ps aux --sort=-%mem | head -15
```

Swap persistente por dez minutos ou container acima de 80% exige revisão. Não limpe swap
durante pressão de memória; isso pode forçar OOM. Reverta uma release problemática ou
pare temporariamente um serviço não crítico com alvo explícito.

## PostgreSQL lento ou indisponível

Mesmo ocioso, o banco precisa estar recuperável:

```bash
docker inspect postgres --format '{{json .State.Health}}'
docker logs postgres --tail 100
docker exec postgres psql -U timeline_admin -d timeline -c 'select now();'
docker exec postgres psql -U timeline_admin -d timeline -c 'show max_connections;'
```

Após a migração futura, acrescente consultas ativas, locks e pool de cada aplicação a
este procedimento. Até lá, falha do banco não justifica injetar credenciais na API.

## Alloy parou de enviar dados

```bash
docker inspect alloy --format '{{json .State}}'
docker logs alloy --since 30m | grep -Ei 'error|401|403|timeout|remote'
docker exec alloy wget -qO- http://api:3001/metrics | head
```

- 401/403: token expirado, revogado ou com usuário incorreto;
- timeout/DNS: teste egresso HTTPS e a rede `edge`;
- apenas API ausente: confirme `/metrics` e participação do Alloy na `edge`;
- apenas logs ausentes: confirme socket Docker e positions no volume `alloydata`.

Para rotacionar, crie novo token somente de escrita, atualize `.env`, recrie Alloy,
confirme ingestão e só então revogue o anterior.

## Deploy manual

```bash
sudo -u ci /usr/local/bin/deploy-from-ci deploy SHA_DE_40_CARACTERES
```

O script baixa `web:SHA` e `api:SHA`, atualiza `RELEASE_SHA`, sobe os dois serviços e
aguarda healthchecks. Não altere `latest` manualmente para simular uma release.

## Rollback conjunto

```bash
cd /opt/stack/apps
cp .env.images ".env.images.before-rollback.$(date -u +%Y%m%dT%H%M%SZ)"
sed -i 's/^RELEASE_SHA=.*/RELEASE_SHA=SHA_ANTERIOR/' .env.images
docker compose --env-file .env.images pull web api
docker compose --env-file .env.images up -d web api
docker compose --env-file .env.images ps
```

Confirme os dois serviços:

```bash
docker inspect web --format '{{.Config.Image}} {{.State.Health.Status}}'
docker inspect api --format '{{.Config.Image}} {{.State.Health.Status}}'
curl -fsS https://app.SEUDOMINIO.com/health
```

Se apenas uma imagem voltar, a release fica inconsistente; corrija antes de reabrir
tráfego.

## Restaurar PostgreSQL e Redis

1. baixar do armazenamento externo `globals.sql`, `timeline.dump` e `redis.rdb`;
2. validar arquivos com `pg_restore --list`, grep das roles e `redis-check-rdb`;
3. restaurar primeiro em ambiente descartável;
4. documentar contagens/objetos esperados;
5. somente num incidente real, parar os escritores antes de restaurar produção.

No primeiro deploy não há escritores PostgreSQL/Redis. Após a migração, este runbook deve
ser atualizado com janela de manutenção, ordem de parada e validação de dados da API.

## Acesso administrativo ao banco

Não publique 5432 permanentemente. Para um cliente local, adicione temporariamente bind
somente em `127.0.0.1` no host e abra túnel SSH:

```bash
ssh -L 5432:127.0.0.1:5432 -i CHAVE deploy@VPS
```

Remova o binding após o uso e confirme com `ss -tulpn`.

## Suspeita de invasão

1. bloquear 80/443 no firewall mantendo a sessão SSH atual;
2. tirar snapshot do VPS antes de modificar evidências;
3. registrar processos, conexões, containers, imagens e logs;
4. rotacionar Firebase Admin, OpenRouter, GHCR, Grafana Cloud, PostgreSQL e Redis a partir
   de uma máquina confiável;
5. recriar o servidor de fonte conhecida se houver comprometimento confirmado.

## Manutenção

| Frequência | Ação |
|---|---|
| diária | conferir backup externo e alertas |
| semanal | verificar disco, restarts, RAM e swap |
| mensal | aplicar updates, revisar CVEs e executar auditoria de portas |
| trimestral | restaurar PostgreSQL/Redis e testar rollback de release |
| semestral | atualizar versões maiores e revisar orçamento/ADRs |

Durante os primeiros sete dias, registrar diariamente o pico de RAM de cada container.
