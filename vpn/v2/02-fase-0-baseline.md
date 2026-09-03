# Fase 0 — Baseline do servidor de 16 GiB

## 1. Objetivo

Ter, por escrito, o que o servidor roda hoje e quanto consome, um backup verificado
anterior a qualquer mudança, e os critérios que fazem a migração ser abortada.

## 2. Por que isso existe

Você vai passar as próximas onze fases mudando a plataforma debaixo de uma aplicação que
já funciona. Duas coisas dão errado quando não há baseline.

A primeira é o diagnóstico impossível: daqui a três semanas o app parece lento e não há
como saber se ficou, porque ninguém anotou como era antes. "Parece mais lento no
Kubernetes" é uma frase que você vai ouvir de si mesmo, e ela precisa ter resposta.

A segunda é o backup que ninguém testou. O v1 tinha uma regra — banco não recebe dado real
antes de restore funcionar. Agora o banco **tem** dado real. A regra vira mais forte, não
mais fraca: nada é migrado antes de um restore validado a partir do armazenamento externo.

E um terceiro motivo, menos óbvio: escrever o critério de aborto **antes** de começar.
No meio de uma migração, às onze da noite, com o site fora, você não é a pessoa certa para
decidir se deve continuar. A pessoa certa é você agora.

## 3. Passo a passo

### 3.1 — Inventário do que existe

```bash
# 🖥️ servidor
docker compose -f /opt/stack/traefik/docker-compose.yml ps
docker compose -f /opt/stack/data/docker-compose.yml ps
docker compose -f /opt/stack/apps/docker-compose.yml ps
docker compose -f /opt/stack/observability/docker-compose.yml ps
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
```

Registre num arquivo, versionado junto com esta spec, o `RELEASE_SHA` implantado, as
imagens exatas de Postgres/Redis/Traefik/Alloy e o domínio em uso.

### 3.2 — Recursos do host

```bash
# 🖥️ servidor
free -h
nproc
df -h /
lsblk
swapon --show
uname -r
cat /etc/os-release
```

Confirme que a RAM realmente é 16 GiB — o plano inteiro depende disso, e é barato
descobrir agora que o provedor entregou outra coisa.

### 3.3 — Sete dias de medição

Não pule para a Fase 1 no mesmo dia. Deixe uma semana de coleta rodando pelo Alloy que já
existe, e ao fim registre para cada container:

| Container | RAM média | RAM pico | % do `mem_limit` no pico | CPU pico |
|---|---|---|---|---|
| web | | | | |
| api | | | | |
| postgres | | | | |
| redis | | | | |
| traefik | | | | |
| alloy | | | | |

E para a aplicação, no Grafana Cloud atual:

- p50 e p95 de latência da rota de timeline;
- p50 e p95 das rotas de IA (`/events/ai`, `/events/voice`) — elas são dominadas pelo
  tempo do provider e vão parecer diferentes depois do LiteLLM;
- taxa de erro por status;
- conexões simultâneas no PostgreSQL.

Estes números são a régua contra a qual a Fase 11 vai comparar. Sem eles, a Fase 11 não
tem como terminar.

### 3.4 — Backup e restore antes de tudo

⚠️ Este passo é pré-requisito de todas as fases seguintes.

```bash
# 🖥️ servidor
/opt/stack/backup.sh
ls -lh /opt/backups/$(ls -1 /opt/backups | tail -1)
```

Baixe os artefatos **do armazenamento externo** — não a cópia local recém-gerada — e
restaure num PostgreSQL 16 descartável, seguindo o procedimento da
[Fase 6 do v1](../docs/08-fase-6-postgres-e-redis.md#66--restore-obrigatório). Registre
data, caminho remoto e resultado.

Agora que há dado real, acrescente uma verificação que o v1 não precisava fazer:

```bash
# 💻 local, no ambiente descartável
psql -d timeline_restore_test -c "select count(*) from app.events;"
psql -d timeline_restore_test -c "select max(created_at) from app.events;"
```

O `max(created_at)` precisa ser recente. Um dump que restaura sem erro mas está três
semanas atrasado é pior que um dump que falha, porque parece sucesso.

### 3.5 — Critérios de aborto

Escreva, antes de começar a Fase 1, o que faz você parar e voltar. Sugestão de ponto de
partida, a ser ajustada por você:

1. Qualquer fase que passe de duas janelas de manutenção sem terminar volta ao estado
   anterior e é replanejada.
2. Perda de dado confirmada em qualquer momento: parar tudo, restaurar do backup externo,
   e só então investigar.
3. Se depois do corte da Fase 5 o p95 da timeline ficar acima do dobro do baseline por
   mais de 24h, o corte é revertido para o Compose — que ainda estará no servidor até a
   Fase 11, exatamente por isso.
4. Se a folga medida ficar abaixo de 2 GiB com tudo no ar, o staging (Fase 9) é o primeiro
   a ser desligado, não o Postgres.

## 4. Por que não fazer diferente

**Começar direto pelo k3s.** Tentador, porque a Fase 1 é a divertida. O custo aparece
depois: sem baseline, qualquer regressão de desempenho vira discussão de opinião, e sem
critério de aborto escrito, a decisão de reverter é tomada por alguém cansado.

**Confiar no backup que "roda todo dia".** Um backup nunca testado é um arquivo, não um
backup. Esta é a única fase em que testar custa zero risco.

**Pular a medição de sete dias.** Se a pressa for grande, três dias com um fim de semana
dentro cobrem a maior parte da variação. Menos que isso não pega o padrão semanal, e o uso
de um app pessoal de timeline é fortemente semanal.

## 5. Como garantir que está certo

```bash
# 🖥️ servidor
free -h | awk 'NR==2 {print $2}'
```

Esperado: um valor entre `15Gi` e `16Gi` — o SO reserva parte, então `16Gi` cravado é
improvável e `7,8Gi` significa que o upgrade não aconteceu.

```bash
# 🖥️ servidor
df -h / | awk 'NR==2 {print $4, $5}'
```

Esperado: pelo menos 30 GiB livres. O k3s, as imagens do cluster e os volumes de
observabilidade não cabem num disco quase cheio, e disco cheio é a causa de incidente mais
comum do runbook do v1.

Ao fim da fase você deve ter, no repositório: a tabela de sete dias preenchida, os números
de latência de baseline, o registro do restore com data, e a lista de critérios de aborto.
Se algum dos quatro estiver vazio, a fase não terminou.

## 6. Armadilhas comuns

**"Eu olho os gráficos quando precisar."** Se a stack de observabilidade do v1 for
desligada na Fase 2 antes de você exportar os números, o baseline vai embora junto.
Copie os valores para o repositório, não deixe no Grafana Cloud.

**Medir uma semana atípica.** Uma semana de férias ou uma semana em que você testou muito
a rota de IA não representa nada. Anote se a semana foi atípica; é melhor uma nota
honesta que um número limpo e falso.

**Disco medido só na raiz.** Se `/var/lib/docker` estiver em outro dispositivo, o `df -h /`
mente. Confirme com `lsblk` e `df -h /var/lib/docker`.

## 7. Para estudar

- 🆓 [Google SRE Book, cap. 6 — Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/) — por que o baseline precede a mudança.
- 🆓 [`man free`](https://man7.org/linux/man-pages/man1/free.1.html) — a diferença entre `free`, `available` e `buff/cache`, que é a fonte de metade dos sustos de memória.
- 🆓 [PostgreSQL — Backup and Restore](https://www.postgresql.org/docs/16/backup.html)
