# 01 — Arquitetura e orçamento de recursos

Documento de referência para decidir onde cada serviço entra e se ainda há RAM para
adicioná-lo. O alvo é um único VPS com 4 GiB, tráfego baixo e builds feitos no CI.

## Topologia do primeiro deploy

```text
                             INTERNET
                                |
                       +--------v--------+
                       | Traefik :80/:443|
                       +--------+--------+
                                |
                            rede edge
                                |
                         +------v------+
                         | web (Next)  |
                         |    :3000    |
                         +------+------+
                                |
                         http://api:3001
                                |
                         +------v------+
                         | api (Nest)  |------> Firebase Auth, Firestore e OpenRouter
                         |    :3001    |
                         +------+------+
                                |
                           rede data
                         (internal: true)
                         +------+------+
                         |             |
                    +----v----+   +----v----+
                    |Postgres |   | Redis   |
                    | :5432   |   | :6379   |
                    +---------+   +---------+

    host/container/app metrics + logs -> Alloy -> Grafana Cloud
```

No primeiro deploy PostgreSQL e Redis estão saudáveis, protegidos e com backup, mas a
API não recebe suas URLs. Essa separação evita confundir infraestrutura pronta com
migração de aplicação concluída.

## Serviços futuros, sem containers vazios

| Serviço futuro | Função | Reserva |
|---|---|---:|
| `auth-api` | autenticação própria e futura saída do Firebase Auth | 192 MiB |
| `jobs-api` | receber trabalhos e processar filas Redis | 256 MiB |

Os nomes representam o orçamento e a intenção. Workspaces, portas, contratos e bancos
só serão definidos quando cada serviço for implementado.

## Redes

| Rede | Interna | Participantes | Propósito |
|---|---|---|---|
| `edge` | não | Traefik, web, API e Alloy | entrada, web→API e saída HTTPS |
| `data` | sim | API, PostgreSQL e Redis | dados; o web não acessa bancos |
| `observability` | sim | Alloy | isolamento da coleta local |

`api` participa de `edge` para acessar Firebase/OpenRouter e receber chamadas do web,
mas não tem labels de router nem `ports:`. `traefik.exposedByDefault=false` é obrigatório.
O label `traefik.docker.network=edge` elimina ambiguidade quando um serviço participa de
mais de uma rede.

Quando a API for publicada para o mobile, ela ganhará router HTTPS, CORS allowlist,
rate limit e testes externos numa etapa própria. Não se antecipa essa superfície.

## Orçamento de RAM

Valores em MiB. `mem_limit` é teto, não previsão de consumo médio.

| Componente | Situação | `mem_limit` | Configuração associada |
|---|---|---:|---|
| SO minimal | atual | — | ~250 MiB típicos |
| Docker daemon | atual | — | ~150 MiB típicos |
| Traefik | primeiro deploy | 96 | sem dashboard público |
| web Next.js | primeiro deploy | 384 | heap V8 256 MiB |
| API NestJS | primeiro deploy | 256 | heap V8 160 MiB |
| PostgreSQL 16 | primeiro deploy | 384 | `shared_buffers=96MB` |
| Redis 7 | primeiro deploy | 192 | `maxmemory=128mb`, `noeviction` |
| Alloy | primeiro deploy | 192 | exporters integrados e envio remoto |
| **Containers iniciais** | | **1.504 MiB** | |
| `auth-api` | reserva | 192 | heap futuro de 128 MiB |
| `jobs-api`/worker | reserva | 256 | heap futuro de 160 MiB |
| **Containers com reservas** | | **1.952 MiB** | |
| **Host + containers reservados** | | **~2.352 MiB** | |
| **Folga em 4 GiB** | | **~1.744 MiB** | page cache, picos e crescimento |

O orçamento fica saudável porque Grafana, Loki e VictoriaMetrics não rodam localmente.
Alloy envia os sinais ao Grafana Cloud. Se a hospedagem externa deixar de ser aceitável,
a stack local é uma alternativa consciente, não o padrão silencioso.

### Como validar os números

Depois do deploy, registrar por sete dias:

```bash
docker stats --no-stream
free -h
docker inspect --format '{{.Name}} {{.HostConfig.Memory}}' $(docker ps -q)
```

Alertar quando um container sustentar 80% do limite. Swap em uso contínuo significa que
o dimensionamento falhou; não é folga utilizável.

## PostgreSQL e Redis

Um único PostgreSQL atende os serviços pequenos. Cada aplicação futura recebe database
ou schema e roles próprias, nunca outro container PostgreSQL por padrão.

Parâmetros iniciais:

```conf
shared_buffers = 96MB
effective_cache_size = 512MB
work_mem = 4MB
maintenance_work_mem = 32MB
max_connections = 30
```

Quando os serviços começarem a usar o banco, cada pool deve começar com no máximo cinco
conexões. Aumentar `max_connections` exige medição; PgBouncer é a evolução antes de
centenas de conexões.

Redis usa `noeviction`. Uma fila não pode perder jobs silenciosamente como aconteceria
com `allkeys-lru`. Caches futuros precisam de TTL e monitoramento; se o perfil de cache
crescer, separar instâncias lógicas ou físicas será uma decisão posterior.

## Swap

Manter 4 GiB de swap em arquivo e `vm.swappiness=10`. Swap serve para absorver um pico
curto antes do OOM killer, não para aumentar a capacidade normal do servidor.

## Portas

| Porta | Exposta | Serviço |
|---|---|---|
| 22 | sim, idealmente restrita | SSH |
| 80 | sim | redirect HTTP→HTTPS e ACME |
| 443 | sim | Traefik |
| 3000 | não | web na rede `edge` |
| 3001 | não | API na rede `edge` |
| 5432 | nunca | PostgreSQL na rede `data` |
| 6379 | nunca | Redis na rede `data` |
| 12345 | não | UI interna do Alloy, se habilitada |

Qualquer quarta porta pública exige revisão de arquitetura.

## Caminho de uma requisição

1. DNS resolve o domínio para o VPS.
2. UFW permite 443.
3. Traefik encerra TLS e aplica headers/rate limit.
4. Traefik envia a requisição para `web:3000`.
5. Chamadas `/api/*` chegam ao Next e são encaminhadas para `api:3001`.
6. A API valida o token e usa Firebase/Firestore no primeiro deploy.
7. PostgreSQL e Redis permanecem fora desse caminho até a migração futura.

## Critérios de evolução

- Migrar Firestore somente com schema, adapter, cópia validada e rollback documentados.
- Implementar auth e filas somente quando houver contrato e consumidor reais.
- Expor API ao mobile somente depois de threat model, CORS e rate limit.
- Considerar VPS maior quando o uso sustentado superar 80%, houver swap recorrente ou a
  margem real ficar abaixo de 1 GiB.
