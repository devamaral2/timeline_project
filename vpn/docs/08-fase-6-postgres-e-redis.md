# Fase 6 — Postgres, Redis e backup

## Objetivo

Ao final desta fase, Postgres 16 e Redis 7 estão rodando com limites de memória
adequados a 4GB, senhas fortes, acessíveis apenas pela rede interna, com backup diário
para armazenamento externo — e você **já testou uma restauração completa**.

---

## Por que isso existe

Este é o documento com o maior risco de toda a spec, e vale dizer isso sem rodeios.

Postgres num container, num único VPS, sem réplica, é a configuração mais frágil que
existe para dados. Não há failover: se o servidor morre, o banco morre junto. Não há
recuperação a um ponto no tempo por padrão. Se o volume corromper, você perdeu tudo desde
o último backup.

Isso é aceitável para aprender e para projeto pessoal — não seria para uma aplicação com
clientes pagantes. Mas ser aceitável depende inteiramente de uma condição: **backup
externo, automático e testado**. Sem isso, não é "risco calculado", é só risco.

Por isso a seção de backup deste documento não é o final opcional — é o núcleo. E a regra
é literal: **você não pode colocar dado real no banco antes de ter restaurado um backup
com sucesso pelo menos uma vez.**

O motivo é simples e observado repetidamente: quase todo mundo configura backup, vê o
arquivo aparecendo, e assume que funciona. Aí, no dia da necessidade, descobre que o dump
estava vazio, ou que a senha do bucket expirou, ou que o comando de restore não funciona
como imaginava. Backup não testado é teatro de segurança.

Ver [ADR-006](adr/006-banco-em-container.md) para as alternativas gerenciadas — que são
uma escolha perfeitamente razoável.

---

## Passo a passo

### 6.1 — Gerar segredos

```bash
# 🖥️ servidor
mkdir -p /opt/stack/data
cd /opt/stack/data

cat > .env <<EOF
POSTGRES_USER=appuser
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
POSTGRES_DB=appdb
REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
EOF

chmod 600 .env
cat .env
```

🔒 O `chmod 600` garante que só o dono lê. Sem isso, qualquer usuário do sistema — ou
qualquer processo comprometido rodando como outro usuário — lê suas credenciais.

`tr -d '/+='` remove caracteres que quebram connection strings quando não escapados. É um
detalhe que causa erros confusos: a senha "está certa" mas a conexão falha, porque uma
`/` no meio da URL foi interpretada como separador de caminho.

Crie também o `.env.example` (este sim vai para o git):

```bash
# 💻 local, no repositorio
cat > infra/.env.example <<'EOF'
POSTGRES_USER=appuser
POSTGRES_PASSWORD=CHANGE_ME
POSTGRES_DB=appdb
REDIS_PASSWORD=CHANGE_ME
EOF
```

Mesma convenção dos `*.secret.example.yaml` do seu repositório `k8`: documentar quais
chaves existem, nunca os valores.

### 6.2 — Tuning do Postgres para 4GB

Os padrões do Postgres são conservadores a ponto de serem ruins — pensados para rodar em
qualquer máquina, inclusive um Raspberry Pi. Para um container com 384MB:

`/opt/stack/data/postgres/postgresql.conf`:

```conf
# --- Memoria ---
shared_buffers = 96MB
effective_cache_size = 512MB
work_mem = 4MB
maintenance_work_mem = 32MB

# --- Conexoes ---
max_connections = 50

# --- WAL ---
wal_buffers = 4MB
min_wal_size = 80MB
max_wal_size = 512MB
checkpoint_completion_target = 0.9

# --- Disco (SSD) ---
random_page_cost = 1.1
effective_io_concurrency = 200

# --- Paralelismo (pouco vCPU) ---
max_worker_processes = 2
max_parallel_workers = 2
max_parallel_workers_per_gather = 1

# --- Logs ---
log_min_duration_statement = 1000
log_checkpoints = on
log_connections = off
log_line_prefix = '%m [%p] %q%u@%d '
```

O raciocínio por trás dos números principais:

**`shared_buffers = 96MB`** (25% do limite do container) — é o cache próprio do Postgres.
A recomendação clássica é 25% da RAM disponível. Colocar mais não ajuda porque o page
cache do Linux já faz parte do trabalho, e ambos competiriam pela mesma memória.

**`effective_cache_size = 512MB`** — não é alocação, é uma *estimativa* que o planejador
usa para decidir entre varredura sequencial e uso de índice. Considera o page cache do
sistema, por isso é maior que o limite do container.

**`work_mem = 4MB`** — memória por operação de ordenação/hash. ⚠️ Este é o parâmetro
mais perigoso: ele é **por operação, não por conexão**. Uma consulta complexa pode usar
várias vezes esse valor, e 50 conexões fazendo isso simultaneamente multiplica. Com 50
conexões × 4MB × algumas operações, você já está perto de estourar. Manter baixo é
proteção.

**`max_connections = 50`** — cada conexão custa memória. Aplicações Node devem usar
**pool** de conexões (o `pg` faz isso), então 50 é folgado para 2–3 apps. Se você
precisar de mais, a resposta é PgBouncer, não aumentar este número.

**`log_min_duration_statement = 1000`** — loga consultas acima de 1 segundo. É o jeito
mais barato de descobrir gargalos, e o volume de log é baixo.

**`log_connections = off`** — com healthchecks a cada 30 segundos, ligar isso enche o log
de ruído sem valor.

> Para calcular esses valores para outro tamanho de servidor, use **pgtune**
> (pgtune.leopard.in.ua) — informe RAM, tipo de disco e perfil de uso.

### 6.3 — Compose dos dados

`/opt/stack/data/docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: postgres
    restart: unless-stopped
    expose:
      - "5432"
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_INITDB_ARGS: "--data-checksums"
    command: >
      postgres -c config_file=/etc/postgresql/postgresql.conf
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./postgres/postgresql.conf:/etc/postgresql/postgresql.conf:ro
    networks:
      - internal
    mem_limit: 384m
    memswap_limit: 384m
    shm_size: 128mb
    security_opt:
      - no-new-privileges:true
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 30s

  redis:
    image: redis:7-alpine
    container_name: redis
    restart: unless-stopped
    expose:
      - "6379"
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}
      --maxmemory 128mb
      --maxmemory-policy allkeys-lru
      --appendonly yes
      --appendfsync everysec
      --rename-command FLUSHALL ""
      --rename-command FLUSHDB ""
      --rename-command CONFIG ""
    volumes:
      - redisdata:/data
    networks:
      - internal
    mem_limit: 192m
    memswap_limit: 192m
    security_opt:
      - no-new-privileges:true
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 15s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
  redisdata:

networks:
  internal:
    external: true
```

Decisões que merecem explicação:

**`--data-checksums`** — o Postgres passa a verificar integridade de cada página lida,
detectando corrupção silenciosa de disco. Custa ~2% de desempenho. ⚠️ Só pode ser
definido na **inicialização do cluster** — depois que o banco existe, mudar exige recriar
tudo. Decida agora.

**`shm_size: 128mb`** — o padrão do Docker para memória compartilhada é 64MB, e o
Postgres usa `/dev/shm` para consultas paralelas. Com o padrão, consultas grandes falham
com "could not resize shared memory segment" — erro confuso e difícil de rastrear.

🔒 **`--requirepass` no Redis** — o Redis sem senha, historicamente, foi um dos vetores de
invasão mais explorados: `CONFIG SET dir` combinado com `SAVE` permite escrever arquivos
arbitrários no servidor, incluindo chaves SSH. Mesmo em rede interna, senha é obrigatória
— defesa em profundidade significa não confiar que a rede sozinha te protege.

🔒 **`--rename-command CONFIG ""`** — desabilita comandos perigosos. `CONFIG` é justamente
o que permite o ataque descrito acima. `FLUSHALL`/`FLUSHDB` apagam tudo instantaneamente
— um erro de digitação num cliente conectado ao ambiente errado destrói seu cache inteiro.

**`--maxmemory-policy allkeys-lru`** — quando o Redis atinge o limite, ele descarta as
chaves menos usadas recentemente em vez de recusar escritas. Correto para uso como
**cache**. ⚠️ Se você usar o Redis como fila (BullMQ) ou armazenamento de sessão, essa
política **descarta seus jobs ou sessões silenciosamente**. Nesse caso use
`noeviction` — que faz o Redis recusar escritas, gerando erro visível em vez de perda
silenciosa — e monitore a memória.

**`--appendonly yes` com `everysec`** — persistência com no máximo 1 segundo de perda em
caso de queda. Bom equilíbrio; `always` seria seguro e lento, `no` seria rápido e
arriscado.

### 6.4 — Subir e criar o usuário da aplicação

```bash
# 🖥️ servidor
cd /opt/stack/data
docker compose up -d
docker compose ps
```

🔒 O usuário criado pelo `POSTGRES_USER` é superusuário. A aplicação **não deve** usá-lo:

```bash
# 🖥️ servidor
source .env
docker exec -i postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
-- Usuario da aplicacao, sem privilegios administrativos
CREATE USER hello_app WITH PASSWORD 'TROQUE_POR_SENHA_GERADA';

-- Sem permissao de criar objetos no schema public
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO hello_app;

-- Permissoes de dados apenas
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hello_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hello_app;
SQL
```

O princípio é o do menor privilégio: se a aplicação for comprometida via SQL injection ou
dependência maliciosa, o atacante herda exatamente estas permissões. Com superusuário,
ele teria `COPY TO PROGRAM` — que executa comandos no servidor. Com `hello_app`, o dano
fica restrito aos dados daquelas tabelas.

O `ALTER DEFAULT PRIVILEGES` é o detalhe que muita gente esquece: sem ele, tabelas
criadas *depois* (por uma migração, por exemplo) não teriam as permissões, e a app
quebraria misteriosamente após o próximo deploy.

### 6.5 — Conectar a aplicação

Complete o `/ready` da [Fase 3](05-fase-3-monorepo-local.md):

```typescript
// apps/hello-api/src/db.ts
import pg from "pg";
import { Redis } from "ioredis";
import { env } from "./env.js";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,                        // pool pequeno: max_connections=50 dividido entre apps
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const redis = new Redis(env.REDIS_URL!, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

export async function pingPostgres(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function pingRedis(): Promise<boolean> {
  try {
    return (await redis.ping()) === "PONG";
  } catch {
    return false;
  }
}
```

No compose da app:

```yaml
    environment:
      DATABASE_URL: postgres://hello_app:SENHA@postgres:5432/appdb
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
```

O hostname `postgres` funciona porque o Docker fornece DNS interno usando o nome do
serviço, dentro da rede `internal`.

### 6.6 — 🔒 Acesso externo apenas por túnel SSH

Você vai querer usar DBeaver ou pgAdmin da sua máquina. **Não abra a porta 5432.**

Primeiro, publique a porta apenas no loopback do servidor:

```yaml
    ports:
      - "127.0.0.1:5432:5432"
```

Depois, da sua máquina:

```bash
# 💻 local
ssh -L 5432:localhost:5432 -i ~/.ssh/vps_hostgator deploy@SEU_IP
```

Com o túnel aberto, configure o cliente para `localhost:5432`. O tráfego vai criptografado
pelo SSH, autenticado por chave, e nada fica exposto.

Compare com a alternativa: `ports: "5432:5432"` publica o Postgres para a internet
inteira — e, como visto na [Fase 2](04-fase-2-docker.md), isso **fura o UFW sem aviso**.
Scanners encontram Postgres exposto em horas.

### 6.7 — ⚠️ Backup: a parte que não é opcional

**A regra de 3-2-1**, adaptada à sua realidade: 3 cópias dos dados, em 2 mídias
diferentes, com 1 fora do local. Concretamente: o volume do Docker (1), o dump local no
VPS (2), e o dump no bucket externo (3 — e este é o "fora do local").

Por que o snapshot da HostGator não substitui: ele está na mesma conta e infraestrutura.
Se a conta for comprometida, suspensa, ou se houver falha no lado deles, você perde o
servidor e o backup juntos.

#### Escolher o destino externo

| Serviço | Custo (~10GB) | Nota |
|---|---|---|
| **Backblaze B2** | ~US$0,06/mês | 10GB grátis; mais barato |
| **Cloudflare R2** | US$0/mês até 10GB | Sem taxa de egresso |
| **AWS S3** | ~US$0,25/mês | Mais caro, mais integrado |

Ambos falam o protocolo S3 e funcionam com `rclone`.

#### O script

`/opt/stack/data/backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=/opt/stack/backups
RETENTION_DAYS=7
STAMP=$(date +%Y%m%d-%H%M%S)
REMOTE="b2:seu-bucket-backup"

source /opt/stack/data/.env
mkdir -p "$BACKUP_DIR"

# --- Postgres ---
PG_FILE="$BACKUP_DIR/pg-$STAMP.dump"
docker exec postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --format=custom --compress=6 > "$PG_FILE"

# Um dump valido tem mais que alguns bytes. Sem esta checagem,
# um dump vazio seria enviado e voce so descobriria no dia do desastre.
if [ ! -s "$PG_FILE" ] || [ "$(stat -c%s "$PG_FILE")" -lt 1000 ]; then
  echo "ERRO: dump do Postgres vazio ou suspeito" >&2
  exit 1
fi

# --- Redis ---
docker exec redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning BGSAVE
sleep 5
docker cp redis:/data/dump.rdb "$BACKUP_DIR/redis-$STAMP.rdb"

# --- Envio externo ---
rclone copy "$BACKUP_DIR" "$REMOTE/$(date +%Y/%m)" \
  --include "*-$STAMP.*" --transfers 2

# --- Retencao local ---
find "$BACKUP_DIR" -name "pg-*.dump" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "redis-*.rdb" -mtime +$RETENTION_DAYS -delete

echo "Backup $STAMP concluido: $(du -h "$PG_FILE" | cut -f1)"
```

```bash
# 🖥️ servidor
chmod 700 /opt/stack/data/backup.sh
```

**`--format=custom`** em vez de SQL puro: permite restauração seletiva (uma tabela só),
restauração paralela, e já vem comprimido. É o formato recomendado para qualquer coisa
além de um dump trivial.

**`set -euo pipefail`** faz o script abortar no primeiro erro em vez de continuar e
reportar sucesso. Sem isso, um `pg_dump` que falha ainda enviaria um arquivo vazio para o
bucket — e você teria "backups" todos os dias, todos inúteis.

#### Configurar o rclone e agendar

```bash
# 🖥️ servidor
sudo apt install -y rclone
rclone config    # siga o assistente, escolha "b2" ou "s3", nomeie "b2"
```

```bash
# 🖥️ servidor
crontab -e
```

```cron
0 3 * * * /opt/stack/data/backup.sh >> /var/log/backup.log 2>&1
```

### 6.8 — ⚠️ Testar a restauração (obrigatório)

**Não pule.** Este é o passo que separa backup real de teatro.

```bash
# 🖥️ servidor
source /opt/stack/data/.env

# 1. Criar dados de teste
docker exec -i postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
CREATE TABLE teste_restore (id serial PRIMARY KEY, valor text, criado_em timestamptz DEFAULT now());
INSERT INTO teste_restore (valor) VALUES ('canario-1'), ('canario-2'), ('canario-3');
SQL

# 2. Backup
/opt/stack/data/backup.sh

# 3. Destruir os dados (simulando o desastre)
docker exec -i postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "DROP TABLE teste_restore;"

# 4. Baixar do bucket - restaure do EXTERNO, nao do arquivo local.
#    Testar o arquivo local nao valida o envio nem as credenciais do bucket.
LATEST=$(rclone lsf b2:seu-bucket-backup/$(date +%Y/%m)/ | grep '^pg-' | sort | tail -1)
rclone copy "b2:seu-bucket-backup/$(date +%Y/%m)/$LATEST" /tmp/

# 5. Restaurar
docker exec -i postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --clean --if-exists < "/tmp/$LATEST"

# 6. Verificar
docker exec -i postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "SELECT * FROM teste_restore;"
```

→ Esperado: as três linhas `canario-1`, `canario-2`, `canario-3`.

Se você viu isso, seu backup funciona. **Anote a data deste teste** e repita a cada
três meses — credenciais expiram, scripts quebram silenciosamente, buckets mudam de
política.

```bash
# 🖥️ servidor — limpar
docker exec -i postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP TABLE teste_restore;"
rm /tmp/pg-*.dump
```

---

## Por que não fazer diferente

**"Por que não Postgres gerenciado (Neon, Supabase, RDS)?"** — Honestamente, para uma
aplicação com usuários reais isso seria a escolha mais responsável. Backup automático,
recuperação a ponto no tempo, réplicas e atualizações sem esforço seu. O free tier do Neon
serve projetos pequenos. As razões para self-host aqui: aprendizado operacional (que é um
objetivo explícito seu), latência (banco e app na mesma máquina), custo previsível, e
independência. **Se este projeto virar algo sério, migrar para gerenciado é a decisão
correta** — e a migração é simples com `pg_dump`/`pg_restore`. Ver
[ADR-006](adr/006-banco-em-container.md).

**"Por que não instalar Postgres direto no host, sem container?"** — Argumento legítimo:
menos camadas, desempenho marginalmente melhor, e o dado não depende do ciclo de vida do
container. O contra é a inconsistência operacional — você teria um serviço gerenciado por
`systemd` e o resto por Docker, dois modelos de atualização, dois lugares para olhar. A
diferença de desempenho com volumes nomeados é pequena o bastante para não decidir.

**"Por que não `pg_basebackup` com WAL archiving em vez de `pg_dump`?"** — Isso dá
*point-in-time recovery*: restaurar para qualquer instante, não só para o último backup.
É tecnicamente superior. O custo é complexidade bem maior e mais espaço. Para começar,
`pg_dump` diário é adequado — perda máxima de 24h. Quando os dados justificarem, procure
por **pgBackRest** ou **WAL-G**, que automatizam isso.

**"Por que não Valkey em vez de Redis?"** — Valkey é o fork do Redis mantido pela Linux
Foundation, criado depois da mudança de licença do Redis em 2024. É compatível e uma
escolha defensável. Redis continua com mais material e integração; se a questão de
licença te importar, a troca é praticamente transparente.

**"Por que não usar só o Postgres, dispensando o Redis?"** — Para cache, `UNLOGGED TABLE`
resolve muitos casos. Para fila, existe `SKIP LOCKED`, e ferramentas como `pgmq` e
`graphile-worker` são excelentes. **Menos peças é uma vantagem real.** Mantemos o Redis
porque você pediu explicitamente e porque é a ferramenta certa para sessões e rate
limiting distribuído. Mas se você quiser economizar 192MB, essa é a peça mais dispensável
da stack.

---

## Como garantir que está certo

**Containers saudáveis:**

```bash
# 🖥️ servidor
docker compose ps
```
→ Esperado: ambos `Up` e `(healthy)`.

**Postgres respondendo:**

```bash
# 🖥️ servidor
source /opt/stack/data/.env
docker exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT version();"
```

**A configuração customizada foi aplicada** — teste que revela se o `command` funcionou:

```bash
# 🖥️ servidor
docker exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "SHOW shared_buffers; SHOW max_connections; SHOW work_mem;"
```
→ Esperado: `96MB`, `50`, `4MB`. Se vier `128MB` e `100`, o Postgres está usando os
padrões — o arquivo não foi montado ou o `config_file` está errado.

**Checksums ativos:**

```bash
# 🖥️ servidor
docker exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SHOW data_checksums;"
```
→ Esperado: `on`.

🔒 **Redis exige senha:**

```bash
# 🖥️ servidor
docker exec redis redis-cli ping
```
→ Esperado: `NOAUTH Authentication required.` Se responder `PONG`, **não há senha** —
corrija imediatamente.

🔒 **Comandos perigosos desabilitados:**

```bash
# 🖥️ servidor
source /opt/stack/data/.env
docker exec redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning CONFIG GET maxmemory
```
→ Esperado: erro de comando desconhecido. Se retornar o valor, o `rename-command` não foi
aplicado.

🔒 **Portas não expostas à internet** — o teste que mais importa:

```bash
# 💻 local (PowerShell)
Test-NetConnection SEU_IP -Port 5432
Test-NetConnection SEU_IP -Port 6379
```
→ Esperado: `TcpTestSucceeded : False` nas duas. `True` em qualquer uma é uma emergência.

**A app alcança o banco:**

```bash
# 🖥️ servidor
curl -s http://localhost:3000/ready | jq
```
→ Esperado: `{"status":"ready","checks":{"postgres":true,"redis":true}}`

**O `/ready` degrada corretamente** — teste de comportamento sob falha:

```bash
# 🖥️ servidor
docker stop postgres
sleep 5
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/ready
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/health
docker start postgres
```
→ Esperado: `/ready` retorna `503`, `/health` continua `200`. Isso prova que a separação
funciona: a app está viva (não deve ser reiniciada) mas não está pronta (não deve receber
tráfego).

**Uso de memória dentro do orçamento:**

```bash
# 🖥️ servidor
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"
```
→ Esperado: Postgres abaixo de 60% do limite em repouso. Perto de 100% significa que o
tuning precisa de ajuste.

**Backup funcionando:**

```bash
# 🖥️ servidor
ls -lh /opt/stack/backups/
rclone ls b2:seu-bucket-backup/$(date +%Y/%m)/
```
→ Esperado: arquivos com tamanho plausível (não zero) nos dois lugares.

**⚠️ O teste de restauração da seção 6.8** — o mais importante de todos. Faça-o.

---

## Armadilhas comuns

**Perder o volume ao recriar o container.** `docker compose down -v` remove volumes. O
`-v` apaga seus dados. Nunca use em produção — e se usar, que seja depois de um backup.

**Senha com caracteres especiais quebrando a connection string.** `@`, `/`, `:` e `#` têm
significado na URL. Ou gere senhas sem eles (como fazemos aqui), ou faça URL-encoding.

**`FATAL: sorry, too many clients already`** — o pool da aplicação somado ao de outras
apps passou de `max_connections`. Reduza `max` no pool, não aumente `max_connections`.

**Redis perdendo dados após restart.** Se `appendonly` estiver `no` e o container
reiniciar, tudo em memória se perde. Aceitável para cache puro; desastroso para filas.

**`allkeys-lru` descartando dados de fila.** Se você usar BullMQ com essa política, jobs
somem silenciosamente sob pressão de memória — e o sintoma é "às vezes o job não roda",
que é péssimo de diagnosticar. Use `noeviction` para filas.

**Backup rodando mas o dump está vazio.** Se as credenciais estiverem erradas, o
`pg_dump` falha mas o redirecionamento `>` cria o arquivo mesmo assim. Por isso a
verificação de tamanho no script.

**Cron não encontra o `docker`.** O `PATH` do cron é mínimo. Use caminhos absolutos ou
defina `PATH` no topo do crontab.

**`could not resize shared memory segment`** — é o `shm_size` padrão de 64MB. Já está
tratado no compose acima, mas se aparecer, é isso.

---

## Para estudar

- 🆓 **pgtune** (pgtune.leopard.in.ua) — calcula parâmetros para o seu hardware. Use e
  compare com os valores desta fase para entender o raciocínio.
- 🆓 **Postgres docs: "Server Configuration"** — a referência de cada parâmetro. Consulte
  os que você configurou; a documentação do Postgres é excepcionalmente boa.
- 🆓 **"PostgreSQL Backup and Restore"** — capítulo do manual oficial, cobre `pg_dump`,
  `pg_restore` e as estratégias de PITR.
- 🆓 **Redis docs: "Security"** — explica exatamente o ataque via `CONFIG SET` que
  motivou o `rename-command` aqui. Leitura curta e esclarecedora.
- 🆓 **Redis docs: "Key eviction"** — as políticas de `maxmemory` e quando usar cada uma.
- 🆓 **Hussein Nasser (YouTube)** — os vídeos sobre pooling de conexões e internos do
  Postgres explicam *por que* `max_connections` alto é ruim, com boa profundidade.
- 🆓 **Backblaze B2 + rclone** — a documentação do rclone tem uma página dedicada ao B2
  com o passo a passo de credenciais.
- 💰 **"PostgreSQL 14 Administration Cookbook"** (Riggs & Ciolli) — receitas práticas;
  os capítulos de backup e monitoramento são diretamente aplicáveis.
- 💰 **"The Art of PostgreSQL"** (Dimitri Fontaine) — para quando você quiser usar o
  Postgres bem, não só mantê-lo vivo.
