 # 01 — Arquitetura e orçamento de recursos

Documento de referência. Volte aqui sempre que precisar decidir "onde isso encaixa" ou
"tenho RAM para mais um serviço?".

---

## A arquitetura em uma imagem

```
                          INTERNET
                             |
                    (opcional: Cloudflare)
                             |
                    +--------v--------+
                    |   VPS 4GB       |
                    |  UFW: 22,80,443 |
                    +--------+--------+
                             |
                   +---------v---------+
                   |     TRAEFIK       |  <- unico container com "ports:"
                   |   :80 -> :443     |
                   +--+-------+------+-+
                      |       |      |
        +-------------+       |      +---------------+
        |                     |                      |
   rede "edge"          rede "edge"          rede "observability"
        |                     |                      |
  +-----v-----+        +------v----+          +------v----+
  | hello-api |        | (futuras  |          |  Grafana  |  <- basic auth
  |  :3000    |        |   apps)   |          |   :3000   |
  +-----+-----+        +------+----+          +------+----+
        |                     |                      |
        +---------+-----------+                      |
                  |                                  |
           rede "internal"                    rede "observability"
           (internal: true)                   (internal: true)
                  |                                  |
      +-----------+---------+         +--------------+--------------+
      |                     |         |              |              |
+-----v-----+        +------v----+  +-v-----------+ +v-----+ +------v---+
| Postgres  |        |  Redis    |  | VictoriaM.  | | Loki | | cAdvisor |
|  :5432    |        |  :6379    |  |   :8428     | | :3100| |  :8080   |
+-----------+        +-----------+  +-------------+ +------+ +----------+
      |                     |
   volume               volume        + node-exporter (metricas do host)
   pgdata               redisdata     + Alloy (coleta e envia)
```

**Nada abaixo do Traefik tem `ports:` no compose.** Isso não é preferência estética — é
a diferença entre ter um Postgres privado e ter um Postgres que qualquer scanner da
internet encontra em minutos. Detalhes na [Fase 2](04-fase-2-docker.md).

---

## As três redes e por que não uma só

| Rede            | `internal` | Quem participa                              | Propósito                                        |
| --------------- | ---------- | ------------------------------------------- | ------------------------------------------------ |
| `edge`          | não        | Traefik, apps                               | Traefik alcança as apps para rotear tráfego      |
| `internal`      | **sim**    | apps, Postgres, Redis                       | Apps alcançam os dados; nada sai para a internet |
| `observability` | **sim**    | Traefik, Grafana, VM, Loki, Alloy, cAdvisor | Stack de monitoria isolada                       |

`internal: true` no Docker Compose significa que containers naquela rede **não têm rota
para a internet**. Se seu Postgres for comprometido, o atacante não consegue baixar
ferramentas nem exfiltrar dados por ali. É uma barreira barata e eficaz.

A separação também limita movimentação lateral: o Grafana não alcança o Postgres da
aplicação, e a `hello-api` não alcança o Grafana. Se uma app for invadida por uma
dependência maliciosa do npm — cenário bem mais comum do que se imagina — o estrago
fica contido no que aquela app já podia acessar.

**Por que não uma rede só?** Funciona, e é o que a maioria dos tutoriais faz. Mas aí
qualquer container alcança qualquer outro, e um Redis sem senha vira porta dos fundos
para tudo. A complexidade extra de três redes é declarar mais três linhas no compose.

---

## Orçamento de RAM

Este é o documento mais importante da spec para um servidor de 4GB. Toda decisão daqui
para frente tem que caber nesta tabela.

| Componente | `mem_limit` | Uso típico | Nota |
|---|---:|---:|---|
| SO (Debian/Ubuntu minimal) | — | ~250 MB | Sem GUI, sem painel |
| Docker daemon | — | ~150 MB | Cresce com o nº de containers |
| **Subtotal host** | | **~400 MB** | |
| Traefik v3 | 96 MB | ~50 MB | Go, muito eficiente |
| hello-api (Node) | 192 MB | ~80 MB | Com `--max-old-space-size=144` |
| Postgres 16 | 384 MB | ~200 MB | Tunado para servidor pequeno |
| Redis 7 | 192 MB | ~40 MB | Com `maxmemory 128mb` |
| **Subtotal aplicação** | **864 MB** | | |
| VictoriaMetrics | 256 MB | ~120 MB | Substitui o Prometheus |
| Loki | 256 MB | ~150 MB | Agregação de logs |
| Grafana | 256 MB | ~180 MB | O mais pesado da stack |
| Alloy | 128 MB | ~70 MB | Coletor de logs e métricas |
| cAdvisor | 160 MB | ~110 MB | Métricas por container |
| node-exporter | 32 MB | ~15 MB | Métricas do host |
| **Subtotal observabilidade** | **1088 MB** | | |
| | | | |
| **TOTAL COMPROMETIDO** | **~2.35 GB** | ~1.4 GB real | |
| **Folga** | **~1.65 GB** | | Page cache, picos, novas apps |

Duas leituras importantes desta tabela:

**A coluna `mem_limit` é o pior caso, não o uso normal.** Se você somar os limites e der
mais que a RAM física, isso não é automaticamente errado — chama-se *overcommit*, e
funciona porque nem todos os containers atingem o teto ao mesmo tempo. Mas overcommit
agressivo é como voar sem paraquedas: funciona até não funcionar. A regra prática aqui
é somar no máximo ~70% da RAM em limites, deixando o resto para o page cache do Linux —
que é justamente o que faz o Postgres ser rápido.

**A observabilidade custa quase metade do orçamento.** Isso é normal e é o preço de
saber o que está acontecendo. Se precisar de espaço para apps reais, o primeiro corte é
migrar métricas e logs para o free tier do Grafana Cloud, mantendo só o Alloy localmente
(~130MB em vez de ~1.1GB). Está documentado como opção na
[Fase 8](10-fase-8-observabilidade.md).

### Quanto sobra para novas apps?

Com ~1.65GB de folga, reservando 500MB para page cache e picos:

- **App Node/Fastify simples:** ~150MB cada → cabem ~7
- **App Next.js em produção:** ~300MB cada → cabem ~3
- **Worker de fila (BullMQ):** ~120MB cada → cabem ~9

Na prática, planeje para **2–3 aplicações reais** além do hello-world. Aí você estará
usando o servidor de forma saudável, não no limite.

### O que NÃO cabe

Não tente, mesmo que algum tutorial diga que dá:

| Serviço                    | RAM mínima realista   | Alternativa em 4GB                          |
| -------------------------- | --------------------- | ------------------------------------------- |
| Elasticsearch / OpenSearch | 1–2 GB (JVM)          | `tsvector` + `pg_trgm` no Postgres          |
| Kafka                      | 1 GB+ (JVM)           | Redis + BullMQ                              |
| RabbitMQ                   | 300–500 MB            | Redis + BullMQ                              |
| Supabase self-hosted       | ~2 GB (8+ containers) | Postgres direto + lib de auth               |
| GitLab CE                  | 4 GB+ sozinho         | GitHub (é o que faremos)                    |
| Jenkins                    | 1 GB+                 | GitHub Actions                              |
| Segundo Postgres           | 300 MB                | Outro *database* no mesmo servidor Postgres |
| SonarQube                  | 2 GB+                 | ESLint + `tsc --noEmit` no CI               |

O padrão é claro: **qualquer coisa com JVM está fora.** A JVM reserva heap
agressivamente e não devolve memória ao sistema com facilidade.

---

## Swap: a rede de segurança

4GB de swap em arquivo, com `vm.swappiness=10`.

**Por que 4GB e não 2 ou 8?** A regra antiga de "2× a RAM" vem da época em que swap
servia para hibernação. Hoje, num servidor, swap serve para uma coisa: dar ao kernel uma
alternativa a matar processos quando a memória aperta. 4GB (1× a RAM) é folgado o
suficiente para absorver um pico e pequeno o suficiente para não esconder um problema
real por dias.

**Por que `swappiness=10` e não o padrão 60?** `swappiness` é a agressividade com que o
kernel move páginas para o disco. O padrão 60 faz sentido em desktop. Num servidor, mover
memória ativa do Postgres para disco degrada tudo brutalmente — disco é ordens de
magnitude mais lento que RAM. Com 10, o kernel só recorre ao swap sob pressão real.

⚠️ **Swap não é substituto de RAM.** Se você ver o servidor usando swap
consistentemente, você tem um problema de dimensionamento, não uma solução. Swap é o
airbag: bom que exista, péssimo sinal se você está usando.

---

## Mapa de portas

| Porta             | Exposta à internet?                | Serviço         | Observação                           |
| ----------------- | ---------------------------------- | --------------- | ------------------------------------ |
| 22                | ✅ sim (idealmente restrita por IP) | SSH             | Só chave, nunca senha                |
| 80                | ✅ sim                              | Traefik         | Só redireciona → 443 e responde ACME |
| 443               | ✅ sim                              | Traefik         | Todo o tráfego real                  |
| 3000              | ❌ não                              | Apps Node       | Só na rede `edge`                    |
| 5432              | ❌ **nunca**                        | Postgres        | Acesso externo só por túnel SSH      |
| 6379              | ❌ **nunca**                        | Redis           | Idem                                 |
| 8428              | ❌ não                              | VictoriaMetrics | Só rede `observability`              |
| 3100              | ❌ não                              | Loki            | Idem                                 |
| 8080              | ❌ não                              | cAdvisor        | Idem                                 |
| 9100              | ❌ não                              | node-exporter   | Idem                                 |
| dashboard Traefik | ❌ **nunca direto**                 | Traefik         | Só via rota autenticada              |

Três portas abertas. Só três. Toda vez que você for abrir uma quarta, pare e pergunte se
não dá para fazer via Traefik com autenticação ou via túnel SSH.

---

## O caminho de uma requisição

Vale traçar o percurso completo uma vez, porque quase todo problema de debug se reduz a
"onde nessa cadeia parou?":

1. **DNS** — o navegador resolve `app.seudominio.com` para o IP do VPS.
2. **Firewall (UFW)** — o pacote chega na 443 e é permitido.
3. **Docker (iptables)** — NAT redireciona para o container do Traefik.
4. **Traefik: TLS** — termina a criptografia usando o certificado.
5. **Traefik: roteamento** — casa o `Host()` da regra e escolhe o serviço.
6. **Traefik: middlewares** — aplica security headers, rate limit, auth.
7. **Rede `edge`** — encaminha para `hello-api:3000` (DNS interno do Docker).
8. **App** — Fastify processa, talvez consulte Postgres/Redis pela rede `internal`.
9. **Resposta** — volta pelo mesmo caminho.

Quando algo quebra, debugue nesta ordem: `dig` para o passo 1, `ss -tulpn` e `ufw status`
para o 2, `docker logs traefik` para 4–6, `docker exec` + `curl` para 7–8. O
[runbook](12-runbook-operacao.md) detalha cada um.

---

## Decisões arquiteturais

Cada uma tem uma ADR própria com as alternativas descartadas:

| # | Decisão | ADR |
|---|---|---|
| 001 | Docker Compose em vez de Kubernetes | [adr/001](adr/001-docker-compose-vs-k3s.md) |
| 002 | pnpm + Turborepo | [adr/002](adr/002-pnpm-turborepo.md) |
| 003 | Build no CI, servidor só faz pull | [adr/003](adr/003-build-no-ci.md) |
| 004 | Traefik como reverse proxy | [adr/004](adr/004-traefik.md) |
| 005 | VictoriaMetrics em vez de Prometheus | [adr/005](adr/005-victoriametrics.md) |
| 006 | Postgres e Redis em container | [adr/006](adr/006-banco-em-container.md) |
| 007 | Deploy push via SSH | [adr/007](adr/007-deploy-ssh.md) |

---

## Para estudar

- 🆓 **Docker networking overview** — docs oficiais, seção "Network drivers". Entender
  `bridge` vs `host` vs `none` resolve metade das dúvidas de rede.
- 🆓 **linuxatemyram.com** — explica em dois minutos por que `free -h` "mostrando pouca
  RAM livre" não é problema. Leitura obrigatória antes de entrar em pânico com memória.
- 🆓 **The Twelve-Factor App** (12factor.net) — os princípios por trás de config em
  variável de ambiente, logs como stream, processos stateless. Curto e formativo.
- 💰 **"Designing Data-Intensive Applications"** (Martin Kleppmann) — não é sobre VPS,
  mas o capítulo 1 (confiabilidade, escalabilidade, manutenibilidade) muda como você
  pensa sobre todas as decisões desta spec.
