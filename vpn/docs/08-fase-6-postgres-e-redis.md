# Fase 6 — PostgreSQL, Redis e backup antes da migração

## Objetivo

Subir PostgreSQL 16 e Redis 7 no VPS, sem portas públicas, com credenciais separadas,
limites adequados a 4 GiB e backup externo restaurado com sucesso.

No primeiro deploy a API continua em Firestore. Banco pronto não significa aplicação
migrada: `DATABASE_URL` e `REDIS_URL` não entram no `.env` da API nesta fase.

## 6.1 — Segredos

`/opt/stack/data/.env`, modo `600`:

```dotenv
POSTGRES_ADMIN_USER=timeline_admin
POSTGRES_ADMIN_PASSWORD=GERAR_32_CARACTERES
POSTGRES_DB=timeline
POSTGRES_MIGRATOR_PASSWORD=GERAR_OUTRA_SENHA
POSTGRES_APP_PASSWORD=GERAR_OUTRA_SENHA
REDIS_PASSWORD=GERAR_OUTRA_SENHA
```

Gere cada valor separadamente:

```bash
openssl rand -hex 32
chmod 600 /opt/stack/data/.env
```

O `.env.example` versionado contém apenas placeholders. Nenhum desses valores é build
arg, variável pública do Next ou secret do GitHub Actions.

## 6.2 — Tuning do PostgreSQL

`/opt/stack/data/postgres/postgresql.conf`:

```conf
shared_buffers = 96MB
effective_cache_size = 512MB
work_mem = 4MB
maintenance_work_mem = 32MB
max_connections = 30
wal_buffers = 4MB
min_wal_size = 80MB
max_wal_size = 512MB
checkpoint_completion_target = 0.9
random_page_cost = 1.1
effective_io_concurrency = 200
max_worker_processes = 2
max_parallel_workers = 2
max_parallel_workers_per_gather = 1
log_min_duration_statement = 1000
log_checkpoints = on
log_connections = off
log_line_prefix = '%m [%p] %q%u@%d '
```

Trinta conexões são suficientes para pools futuros de até cinco conexões por serviço,
mais migração, backup e administração. Aumentar esse valor sem medir aumenta RAM por
conexão; PgBouncer é a evolução preferida.

## 6.3 — Compose de dados

`/opt/stack/data/docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_ADMIN_USER}
      POSTGRES_PASSWORD: ${POSTGRES_ADMIN_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_INITDB_ARGS: "--data-checksums"
    command: postgres -c config_file=/etc/postgresql/postgresql.conf
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./postgres/postgresql.conf:/etc/postgresql/postgresql.conf:ro
    expose: ["5432"]
    networks: [data]
    mem_limit: 384m
    memswap_limit: 384m
    shm_size: 128mb
    security_opt: [no-new-privileges:true]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_ADMIN_USER} -d ${POSTGRES_DB}"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 30s

  redis:
    image: redis:7-alpine
    container_name: redis
    restart: unless-stopped
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}
      --maxmemory 128mb
      --maxmemory-policy noeviction
      --appendonly yes
      --appendfsync everysec
      --rename-command FLUSHALL ""
      --rename-command FLUSHDB ""
      --rename-command CONFIG ""
    volumes:
      - redisdata:/data
    expose: ["6379"]
    networks: [data]
    mem_limit: 192m
    memswap_limit: 192m
    security_opt: [no-new-privileges:true]
    healthcheck:
      test: ["CMD-SHELL", "redis-cli -a $$REDIS_PASSWORD ping"]
      interval: 15s
      timeout: 5s
      retries: 5
    environment:
      REDIS_PASSWORD: ${REDIS_PASSWORD}

volumes:
  pgdata:
  redisdata:

networks:
  data:
    external: true
```

`noeviction` é obrigatório porque Redis foi reservado para fila. Ao atingir o limite,
uma escrita falha de forma visível em vez de apagar jobs silenciosamente.

## 6.4 — Roles com menor privilégio

Suba os serviços e carregue o `.env` apenas no shell administrativo:

```bash
cd /opt/stack/data
set -a; . ./.env; set +a
docker compose up -d
```

Crie uma role para migrations e outra para runtime:

```bash
docker compose exec -T postgres psql \
  -v ON_ERROR_STOP=1 \
  -v migrator_password="$POSTGRES_MIGRATOR_PASSWORD" \
  -v app_password="$POSTGRES_APP_PASSWORD" \
  -U "$POSTGRES_ADMIN_USER" -d "$POSTGRES_DB" <<'SQL'
CREATE ROLE timeline_migrator LOGIN PASSWORD :'migrator_password';
CREATE ROLE timeline_app LOGIN PASSWORD :'app_password';

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA app AUTHORIZATION timeline_migrator;
GRANT CONNECT ON DATABASE timeline TO timeline_migrator, timeline_app;
GRANT USAGE ON SCHEMA app TO timeline_app;

ALTER DEFAULT PRIVILEGES FOR ROLE timeline_migrator IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO timeline_app;
ALTER DEFAULT PRIVILEGES FOR ROLE timeline_migrator IN SCHEMA app
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO timeline_app;
SQL
```

Se repetir a fase, consulte `\du` e `\dn+` antes: os comandos `CREATE ROLE/SCHEMA` não são
idempotentes. Nunca torne `timeline_app` superusuário nem dono do schema.

As credenciais `timeline_migrator` e `timeline_app` ficam guardadas, mas ainda não são
entregues a nenhum container de aplicação.

## 6.5 — Backup externo

O backup diário contém três artefatos:

1. `globals.sql` — roles e grants globais;
2. `timeline.dump` — banco em formato custom;
3. `redis.rdb` — snapshot após `BGSAVE`.

Trecho central de `/opt/stack/backup.sh`:

```bash
set -euo pipefail
backup_dir="/opt/backups/$(date -u +%Y-%m-%dT%H-%M-%SZ)"
mkdir -p "$backup_dir"

cd /opt/stack/data
set -a; . ./.env; set +a

docker compose exec -T postgres pg_dumpall \
  -U "$POSTGRES_ADMIN_USER" --globals-only > "$backup_dir/globals.sql"
docker compose exec -T postgres pg_dump \
  -U "$POSTGRES_ADMIN_USER" -d "$POSTGRES_DB" -Fc > "$backup_dir/timeline.dump"

docker compose exec -T redis redis-cli -a "$REDIS_PASSWORD" BGSAVE
sleep 5
docker cp redis:/data/dump.rdb "$backup_dir/redis.rdb"

test -s "$backup_dir/globals.sql"
test -s "$backup_dir/timeline.dump"
test -s "$backup_dir/redis.rdb"

rclone copy "$backup_dir" remoto:timeline-backups/"$(basename "$backup_dir")"
find /opt/backups -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf -- {} +
```

Configure o destino `rclone` fora do VPS e agende diariamente por systemd timer ou cron.
Logs do job devem chegar ao Alloy.

## 6.6 — Restore obrigatório

Baixe os arquivos do armazenamento externo, não use a cópia que acabou de gerar. Restaure
num PostgreSQL 16 descartável ou em uma database temporária sem tocar `timeline`.

Verificações mínimas:

```bash
pg_restore --list timeline.dump >/dev/null
grep -q 'timeline_migrator' globals.sql
grep -q 'timeline_app' globals.sql
docker run --rm -v "$PWD:/backup:ro" redis:7-alpine \
  redis-check-rdb /backup/redis.rdb
```

No ambiente descartável:

1. aplicar `globals.sql`;
2. criar `timeline_restore_test` com owner `timeline_migrator`;
3. executar `pg_restore --exit-on-error`;
4. confirmar schema `app` e as duas roles;
5. iniciar Redis temporário com o `redis.rdb` e exigir `PONG` autenticado;
6. destruir somente o ambiente descartável.

Registre data, caminho remoto e resultado no checklist. Backup sem restore testado não
conclui a fase, mesmo que o banco ainda esteja vazio.

## Como garantir que está certo

```bash
docker compose ps
docker stats --no-stream postgres redis
docker inspect postgres --format '{{json .NetworkSettings.Ports}}'
docker inspect redis --format '{{json .NetworkSettings.Ports}}'
docker exec postgres psql -U timeline_admin -d timeline -c 'show max_connections;'
docker exec postgres psql -U timeline_admin -d timeline -c '\du'
docker exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG GET maxmemory-policy
```

Esperado: ambos `healthy`, nenhuma porta publicada, PostgreSQL em 30 conexões e Redis em
`noeviction`. Confirme por fim que o container `api` não contém `DATABASE_URL` nem
`REDIS_URL`.

## Migração futura, fora de escopo

A saída do Firestore exigirá um documento próprio para schema, ORM/driver, repositories,
cópia de dados, reconciliação, corte, rollback e posterior remoção das credenciais
Firestore. Esta fase entrega infraestrutura e recuperação; não antecipa essas decisões.
