# 12 — Runbook de operação

Documento de consulta rápida para quando algo está acontecendo. Organizado por sintoma,
não por tecnologia — porque quando você abre este arquivo, você sabe o que está errado,
não onde.

**Regra geral antes de qualquer ação:** anote a hora e o que você observou. Diagnóstico
destrói evidência, e daqui a 40 minutos você não vai lembrar do que viu no início.

---

## Diagnóstico inicial — os cinco comandos

Rode sempre estes, nesta ordem, antes de formar hipótese:

```bash
# 🖥️ servidor
df -h /                      # 1. disco cheio? (causa mais comum)
free -h                      # 2. memoria e swap
docker compose ps            # 3. o que esta de pe
docker stats --no-stream     # 4. quem esta consumindo
journalctl -p err -n 30 --no-pager   # 5. erros do sistema
```

Cerca de 70% dos problemas em VPS pequeno são explicados pelos itens 1 ou 2.

---

## Sintoma: o site não responde

### Passo 1 — De fora para dentro

Percorra a cadeia da [arquitetura](01-arquitetura-e-orcamento.md) na ordem:

```bash
# 💻 local
nslookup SEU_DOMINIO                    # DNS resolve?
Test-NetConnection SEU_IP -Port 443     # porta responde?
curl -svI https://SEU_DOMINIO 2>&1 | head -30
```

| Onde falhou | Causa provável |
|---|---|
| DNS não resolve | Registro A errado, ou propagação pendente |
| Porta 443 fechada | Traefik caído, UFW, ou regra `DOCKER-USER` |
| TLS falha | Certificado expirado ou ACME quebrado |
| 404 | Regra de roteamento do Traefik não casou |
| 502/503 | Traefik está de pé, a aplicação não |
| 504 | App lenta, ou escutando em `127.0.0.1` |

### Passo 2 — Dentro do servidor

```bash
# 🖥️ servidor
docker compose -f /opt/stack/traefik/docker-compose.yml ps
docker logs traefik --tail 50
docker compose -f /opt/stack/apps/docker-compose.yml ps
docker logs hello-api --tail 50
```

### Passo 3 — Testar a app sem o Traefik

Isola a camada:

```bash
# 🖥️ servidor
docker exec hello-api wget -qO- http://localhost:3000/health
```
→ Se responde aqui e não pelo Traefik, o problema é roteamento/rede. Se não responde nem
aqui, o problema é a aplicação.

```bash
# 🖥️ servidor
docker network inspect edge --format '{{range .Containers}}{{.Name}} {{end}}'
```
→ Traefik e a app precisam ambos aparecer.

---

## Sintoma: container reiniciando em loop

```bash
# 🖥️ servidor
docker ps -a --filter "status=restarting"
docker logs NOME --tail 100
docker inspect NOME --format '{{.State.ExitCode}} OOMKilled={{.State.OOMKilled}}'
```

| Exit code | Significado | Ação |
|---|---|---|
| `137` + `OOMKilled=true` | Estourou o `mem_limit` | Aumentar limite ou ajustar `--max-old-space-size` |
| `137` sem OOMKilled | Recebeu SIGKILL | Verificar se o healthcheck está matando |
| `139` | Segfault | Incompatibilidade binária (Alpine/musl) |
| `1` | Erro da aplicação | Ler o log |
| `0` reiniciando | Processo termina sozinho | O comando não é de longa duração |

**Se for OOM:**

```bash
# 🖥️ servidor
dmesg -T | grep -i "killed process" | tail -5
```
Mostra exatamente qual processo o kernel matou e quando.

---

## Sintoma: disco cheio

O mais urgente, porque paralisa tudo.

```bash
# 🖥️ servidor
df -h
du -sh /var/lib/docker/* 2>/dev/null | sort -rh | head
du -sh /opt/stack/* 2>/dev/null | sort -rh | head
```

**Culpados, em ordem de probabilidade:**

```bash
# 1. Logs de container sem rotacao
du -sh /var/lib/docker/containers/

# 2. Imagens antigas acumuladas de deploys
docker images | wc -l

# 3. Volume do Loki sem retencao
docker system df -v | grep -i loki

# 4. Backups locais nao limpos
du -sh /opt/stack/backups/
```

**Alívio imediato** (do mais seguro ao mais agressivo):

```bash
# 🖥️ servidor
docker image prune -af --filter "until=168h"    # imagens sem uso ha 7 dias
docker builder prune -af                        # cache de build
sudo journalctl --vacuum-time=3d                # logs do systemd
```

⚠️ **Nunca** use `docker system prune -a --volumes` sem pensar: o `--volumes` apaga seus
volumes de dados. Postgres incluído.

**Correção definitiva:** rotação de log no `daemon.json`
([Fase 2](04-fase-2-docker.md)), retenção no Loki ([Fase 8](10-fase-8-observabilidade.md)),
e `image prune` no script de deploy ([Fase 7](09-fase-7-cicd-github-actions.md)).

---

## Sintoma: servidor lento, swap em uso

```bash
# 🖥️ servidor
free -h
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}"
uptime
```

Se o `load average` estiver acima do número de vCPUs por vários minutos, há saturação
real.

**Se o swap está sendo usado consistentemente**, você está sem RAM. Opções, na ordem:

1. Identifique o maior consumidor e reduza o limite dele
2. Corte a observabilidade para a alternativa leve
   ([Fase 8](10-fase-8-observabilidade.md), "Alternativa mais leve")
3. Faça upgrade do plano

```bash
# 🖥️ servidor — quem esta consumindo, incluindo processos do host
ps aux --sort=-%mem | head -10
```

---

## Sintoma: banco lento

```bash
# 🖥️ servidor
source /opt/stack/data/.env

# Consultas rodando agora
docker exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT pid, now()-query_start AS duracao, state, left(query,80)
   FROM pg_stat_activity
   WHERE state != 'idle' ORDER BY duracao DESC LIMIT 10;"

# Consultas lentas ja registradas
docker logs postgres --tail 200 | grep "duration:"

# Conexoes em uso vs limite
docker exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT count(*) AS conexoes, (SELECT setting FROM pg_settings WHERE name='max_connections') AS limite
   FROM pg_stat_activity;"
```

**Matar uma consulta travada:**

```bash
# 🖥️ servidor
docker exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT pg_cancel_backend(PID);"      # tenta cancelar (educado)
# se nao ceder:
docker exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT pg_terminate_backend(PID);"   # encerra a conexao
```

---

## Procedimento: deploy manual

Quando o CI está fora, ou você quer forçar:

```bash
# 🖥️ servidor
cd /opt/stack/apps
docker compose pull
docker compose up -d --remove-orphans
docker compose ps
docker compose logs -f --tail 50
```

---

## Procedimento: rollback

**Pratique isto antes de precisar.** Um rollback ensaiado leva 2 minutos; um improvisado
leva 40.

```bash
# 🖥️ servidor
# 1. Descobrir quais versoes existem localmente
docker images ghcr.io/SEU_USUARIO/hello-api --format "{{.Tag}}\t{{.CreatedSince}}"

# 2. Se a versao anterior nao estiver local, baixe pelo SHA
docker pull ghcr.io/SEU_USUARIO/hello-api:SHA_ANTERIOR

# 3. Fixar a tag no compose
cd /opt/stack/apps
sed -i "s|hello-api:.*|hello-api:SHA_ANTERIOR|" docker-compose.yml

# 4. Aplicar
docker compose up -d hello-api

# 5. Confirmar
docker inspect hello-api --format '{{.Config.Image}}'
curl -s http://localhost:3000/health
```

⚠️ **Rollback de código é fácil; rollback de banco não é.** Se o deploy incluiu uma
migração que alterou o schema, voltar a versão anterior do código pode quebrar contra o
banco novo. Por isso migrações devem ser **compatíveis para trás**: adicione colunas antes
de usá-las, remova só depois que nenhuma versão em uso as referencia.

Depois do rollback, faça o `git revert` do commit problemático para que o próximo deploy
não reintroduza o problema.

---

## Procedimento: restaurar o banco

```bash
# 🖥️ servidor
source /opt/stack/data/.env

# 1. Listar backups disponiveis no bucket
rclone lsf b2:seu-bucket-backup/$(date +%Y/%m)/

# 2. Baixar o escolhido
rclone copy "b2:seu-bucket-backup/$(date +%Y/%m)/pg-ARQUIVO.dump" /tmp/

# 3. Parar a aplicacao para evitar escrita durante a restauracao
docker compose -f /opt/stack/apps/docker-compose.yml stop

# 4. Restaurar
docker exec -i postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --clean --if-exists --verbose < /tmp/pg-ARQUIVO.dump

# 5. Verificar antes de religar
docker exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt"

# 6. Religar
docker compose -f /opt/stack/apps/docker-compose.yml start
```

---

## Procedimento: renovar certificado manualmente

Normalmente o Traefik renova sozinho aos 30 dias restantes. Se não renovou:

```bash
# 🖥️ servidor
# 1. Ver a validade atual
echo | openssl s_client -connect SEU_DOMINIO:443 2>/dev/null | openssl x509 -noout -dates

# 2. Ver o que o Traefik diz
docker logs traefik 2>&1 | grep -i acme | tail -20

# 3. Ultimo recurso: forcar nova emissao
docker compose -f /opt/stack/traefik/docker-compose.yml down
cp /opt/stack/traefik/certs/acme.json /opt/stack/traefik/certs/acme.json.bak
echo "{}" > /opt/stack/traefik/certs/acme.json
chmod 600 /opt/stack/traefik/certs/acme.json
docker compose -f /opt/stack/traefik/docker-compose.yml up -d
docker logs -f traefik | grep -i acme
```

⚠️ Isso consome cota do Let's Encrypt. Faça o backup do `acme.json` antes, e não repita
mais de duas vezes seguidas — você tem 5 falhas por hora.

---

## Procedimento: acesso ao banco pela sua máquina

```bash
# 💻 local
ssh -L 5432:localhost:5432 -i ~/.ssh/vps_hostgator deploy@SEU_IP
```
Com o túnel aberto, conecte o cliente em `localhost:5432`.

Para o Grafana ou qualquer serviço interno:

```bash
# 💻 local
ssh -L 8443:localhost:443 -i ~/.ssh/vps_hostgator deploy@SEU_IP
```

---

## Procedimento: reiniciar tudo na ordem correta

A ordem importa: dados antes de aplicações, aplicações antes do proxy.

```bash
# 🖥️ servidor
docker compose -f /opt/stack/data/docker-compose.yml up -d
sleep 20
docker compose -f /opt/stack/apps/docker-compose.yml up -d
sleep 10
docker compose -f /opt/stack/traefik/docker-compose.yml up -d
docker compose -f /opt/stack/observability/docker-compose.yml up -d
```

---

## Procedimento: suspeita de invasão

⚠️ Na ordem, sem pular:

```bash
# 🖥️ servidor
# 1. ISOLAR - fecha o trafego web, mantem o SSH
sudo ufw deny 80/tcp
sudo ufw deny 443/tcp

# 2. PRESERVAR - snapshot pelo painel da HostGator, AGORA.
#    Investigar destroi evidencia.

# 3. LEVANTAR o que aconteceu
last -30
sudo lastb -30
ps auxf
ss -tulpn
docker ps -a
crontab -l; sudo crontab -l
ls -la ~/.ssh/ /home/*/.ssh/
sudo find /etc -mtime -7 -type f 2>/dev/null
```

**Depois:** não tente "limpar" um servidor comprometido — você nunca terá certeza de que
removeu tudo. Reinstale do zero, restaure dados de um backup **anterior** à invasão, e
rotacione **todos** os segredos: banco, Redis, GitHub, chaves SSH, tokens de API,
credenciais do bucket.

---

## Manutenção periódica

| Frequência | Tarefa |
|---|---|
| **Semanal** | Revisar alertas disparados; conferir PRs do Dependabot |
| **Mensal** | Rodar `/opt/stack/audit.sh`; `apt upgrade` + reboot planejado; revisar uso de disco |
| **Trimestral** | ⚠️ **Testar restauração de backup**; rodar `lynis`; revisar chaves SSH ativas |
| **Semestral** | Atualizar versões maiores (Postgres, Traefik, Grafana); revisar as ADRs |

O item trimestral em negrito é o único inegociável.

---

## Para estudar

- 🆓 **Google SRE Workbook, "Incident Response"** — gratuito online. Estrutura de papéis
  e comunicação durante incidentes; adaptável mesmo sendo uma pessoa só.
- 🆓 **"Blameless PostMortems"** (Etsy Code as Craft) — o artigo que popularizou a
  prática. Escrever postmortem para si mesmo parece exagero até a segunda vez que você
  comete o mesmo erro.
- 🆓 **`man journalctl`** — filtros por unidade, prioridade e tempo. Investir 20 minutos
  aqui economiza horas em cada investigação.
- 🆓 **Brendan Gregg — "Linux Performance"** (brendangregg.com) — o método USE (Utilization,
  Saturation, Errors) dá um roteiro sistemático para diagnosticar lentidão em vez de
  chutar.
- 💰 **"Systems Performance"** (Brendan Gregg) — a referência definitiva. Denso; use como
  consulta.
