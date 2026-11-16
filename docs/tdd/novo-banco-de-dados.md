---
status: accepted
date: 2026-11-14
---

# TDD: Novo banco de dados da agenda

> Nota: a entidade única descrita aqui passou a se chamar **tarefa** ([ADR 0015](../adr/0015-tarefa-como-nome-da-entidade-unica.md)). O texto mantém "evento" como histórico; o modelo não mudou.

## Contexto e objetivo

O banco passa de 28 para 13 tabelas, em torno de duas entidades: evento e artefato. As decisões e os motivos estão
nas ADRs [0011](../adr/0011-evento-unico-com-executor-e-artefato-no-lugar-da-nota.md),
[0012](../adr/0012-relacoes-em-tres-tabelas-no-sentido-de-quem-produz.md) e
[0013](../adr/0013-ia-sem-tabelas-proprias-e-fila-unica.md). Os termos estão no [CONTEXT.md](../../CONTEXT.md), seção
Agenda. Este documento guarda o que as ADRs não guardam: colunas, checks, índices e a consulta que cada tela faz.

Os índices saíram da leitura das consultas que o código faz hoje. O teste de integração confere que a consulta de
cada tela casa com o índice feito para ela, mas nenhum foi medido com volume real de dados.

## Estado da implementação

A API já roda sobre este banco: o esquema antigo, as 24 migrations anteriores e o RabbitMQ saíram. O web já fala os
contratos novos (o contrato antigo saiu do web no ticket 51); só o app Android falta, e ele não funciona contra esta API
até ser portado.

| Peça | Onde |
|---|---|
| Conjuntos fechados (tipos, status, relações) | `apps/api/src/domain/sets.ts` |
| Esquema Drizzle das 13 tabelas | `apps/api/src/infrastructure/persistence/database/schema/` |
| Migration inicial | `apps/api/drizzle/0000_initial.sql` |
| Banco de teste com a migration aplicada | `apps/api/src/infrastructure/persistence/testing/postgres-test-context.ts` |
| Teste dos checks, restrições e índices | `apps/api/src/infrastructure/persistence/integration/schema.integration.test.ts` |
| Fila única | `apps/api/src/infrastructure/jobs/` e `apps/api/src/infrastructure/persistence/jobs/` |
| Contratos HTTP | `packages/contracts/src/` |

Para gerar de novo a migration depois de mudar o esquema:

```bash
pnpm --filter @repo/api run db:generate
```

A migration inicial tem duas edições à mão, que precisam ser refeitas se ela for gerada de novo:

- O Drizzle não gera `DEFERRABLE`: a restrição `event_artifact_event_position_unique` foi editada.
- Os cinco exercícios globais (esteira, corrida, caminhada, musculação, livre) entram no fim, como artefatos do tipo
  `workout` sem dono.

### Rotas

| Rota | O que faz |
|---|---|
| `GET /api/events` | Janela da agenda, em páginas; filtros `from`, `to`, `actor`, `kind`, `tag` |
| `GET /api/events/tracked` | Lista de tarefas; filtros `status`, `priority`, `actor`, `tag`, `q`, `from`, `to`, `longRunning` |
| `POST /api/events`, `GET`, `PATCH` e `DELETE /api/events/:eventId` | Criar, ler, editar e apagar um evento de pessoa |
| `GET` e `POST /api/artifacts`, `GET`, `PATCH` e `DELETE /api/artifacts/:artifactId` | Artefatos; `scope=global` lista os globais de um tipo |
| `GET` e `POST /api/recurrences`, `GET`, `PATCH` e `DELETE /api/recurrences/:recurrenceId` | Séries |
| `GET /api/tags` | Sugestão de tags por prefixo |
| `POST /api/requests`, `/api/requests/edit`, `/api/requests/hermes`, `/api/requests/voice` | Abrir um pedido ao agente |
| `GET /api/requests`, `GET /api/requests/:requestId`, `POST /api/requests/:requestId/cancel` | Acompanhar e cancelar pedidos |

## Fora de escopo

- Migração de dados: o banco recomeça do zero, com uma migration inicial nova.
- A tela do chat com a IA, que não muda. Só o armazenamento por baixo dela muda (ADR 0013).
- O app Android, que só entra depois da API e do web.
- O banco do `apps/auth`.

## Tabelas

| Grupo | Tabelas |
|---|---|
| Domínio | `events`, `event_entries`, `artifacts` |
| Relações | `event_event_relation`, `event_artifact_relation`, `artifact_artifact_relation` |
| Tags | `tags`, `event_tags`, `artifact_tags` |
| Recorrência | `recurrences`, `recurrence_exceptions` |
| Execução e apoio | `jobs`, `idempotency_keys` |

Os conjuntos fechados são `text` com check, e não tipo enumerado do Postgres: o conjunto muda com uma migration
simples e fica num lugar só do código (`domain/sets.ts`), que alimenta o tipo da coluna e o check.

### `events`

```sql
create table events (
  id                     char(26) primary key,            -- ULID
  revision               integer not null default 1,
  user_id                text not null,
  actor                  text not null,                   -- human | agent
  kind                   text not null,
  status                 text,                            -- nulo = evento de referência
  priority               text not null default 'medium',  -- urgent | high | medium | low
  name                   text not null,
  description            text not null default '',
  started_at             timestamptz,                     -- início planejado
  estimated_finish_at    timestamptz,                     -- fim planejado: fim do bloco, ou prazo no evento longo
  finished_at            timestamptz,                     -- conclusão real
  notify_offsets_minutes integer[] not null default '{}',
  recurrence_id          char(26) references recurrences (id) on delete set null,
  occurrence_on          date,
  recurrence_detached    boolean not null default false,
  long_running           boolean not null default false,
  data                   jsonb not null default '{}',     -- pequeno: resumo, agente interno do passo, contexto de tela
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz
);
```

Checks:

```sql
revision >= 1
actor in ('human', 'agent')
priority in ('urgent', 'high', 'medium', 'low')

-- tipo conforme o executor
(actor = 'human' and kind in ('routine', 'meal', 'sleep', 'training'))
or (actor = 'agent' and kind in ('request', 'search_request', 'build_request',
                                 'inquiry_request', 'review_request', 'cron', 'step'))

-- status conforme o executor; só evento de pessoa pode não ter status
-- (o "is not null" do agente é necessário: "null in (...)" é nulo, e um check nulo passa)
(actor = 'human' and (status is null
                      or status in ('todo', 'toDefine', 'doing', 'inHold', 'done', 'cancel', 'missed')))
or (actor = 'agent' and status is not null
    and status in ('queued', 'running', 'waiting', 'done', 'failed', 'cancel'))

-- evento longo: de pessoa, com status, sem recorrência, nunca perdido
not long_running or (actor = 'human' and status is not null and status <> 'missed' and recurrence_id is null)

-- evento longo sem prazo não tem aviso
not long_running or estimated_finish_at is not null or cardinality(notify_offsets_minutes) = 0

-- fora do evento longo, o fim planejado não vem antes do início e o bloco dura no máximo 31 dias
long_running or started_at is null or estimated_finish_at is null
  or (estimated_finish_at >= started_at and estimated_finish_at - started_at <= interval '31 days')

recurrence_id is null or occurrence_on is not null
1 <= all (notify_offsets_minutes) and 43200 >= all (notify_offsets_minutes)
```

Não há check entre `finished_at` e `started_at`: concluir hoje um evento marcado para amanhã é válido. No evento
longo também não há check entre o prazo e o início, porque `started_at` é o início real e um projeto pode começar
depois do prazo.

Índices:

```sql
-- agenda: pessoa e agente, sem passos e sem eventos longos
create index events_agenda_idx on events (user_id, started_at, id)
  where started_at is not null and not long_running and kind <> 'step' and deleted_at is null;

-- lista de tarefas: eventos com status, de pessoa e de agente, incluindo os longos e sem passos
create index events_tracked_idx on events (user_id, status, (coalesce(started_at, estimated_finish_at)), id)
  where status is not null and kind <> 'step' and deleted_at is null;

-- pedidos do usuário, do mais novo para o mais antigo
create index events_requests_idx on events (user_id, id desc)
  where actor = 'agent' and kind <> 'step' and deleted_at is null;

-- todos os eventos vivos de pessoa: agente de consulta e busca por nome
create index events_user_live_idx on events (user_id, id)
  where actor = 'human' and deleted_at is null;

-- uma ocorrência por dia da série; a ocorrência apagada continua ocupando o dia, de propósito
create unique index events_recurrence_occurrence_unique on events (recurrence_id, occurrence_on)
  where recurrence_id is not null;
```

### `event_entries`

Só recebe inserções. Acrescentar uma entrada não incrementa a `revision` do evento.

```sql
create table event_entries (
  id         char(26) primary key,                 -- ULID; dá a ordem
  event_id   char(26) not null references events (id) on delete cascade,
  user_id    text not null,
  kind       text not null,                        -- message | thought | trace | result | input
  role       text,                                 -- só em message: user | agent
  content    text,
  data       jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- checks
kind in ('message', 'thought', 'trace', 'result', 'input')
(kind = 'message') = (role is not null)
role is null or role in ('user', 'agent')
kind <> 'trace' or content is null                 -- trace guarda só números e códigos, em data

create index event_entries_event_idx on event_entries (event_id, id);
```

### `artifacts`

```sql
create table artifacts (
  id             char(26) primary key,
  revision       integer not null default 1,
  user_id        text,                             -- nulo = artefato global
  type           text not null,                    -- text | food | sleep | training | workout | skill | agent | router
  schema_version integer not null default 1,
  name           text not null,
  data           jsonb not null default '{}',
  derived        boolean not null default false,   -- cópia de outro artefato
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- checks
revision >= 1
schema_version >= 1
type in ('text', 'food', 'sleep', 'training', 'workout', 'skill', 'agent', 'router')
jsonb_typeof(data) = 'object'
user_id is not null or type in ('food', 'workout')  -- global só para alimento e exercício

-- lista por tipo, sem as cópias
create index artifacts_user_type_recent_idx on artifacts (user_id, type, updated_at desc, id desc)
  where deleted_at is null and not derived;

-- catálogo global por nome
create index artifacts_global_idx on artifacts (type, name)
  where user_id is null and deleted_at is null;

-- exercício global pelo código
create unique index artifacts_workout_code_unique on artifacts ((data ->> 'code'))
  where type = 'workout' and user_id is null;

-- um artefato por arquivo de skill ou de agente (ADR 0005)
create unique index artifacts_agent_file_unique on artifacts (user_id, (data ->> 'path'))
  where type in ('skill', 'agent') and deleted_at is null;
```

Os números do alimento (calorias, quantidades) e a categoria do exercício passam a morar em `data`. Os checks que hoje
existem nessas colunas deixam de ser do banco e passam para a validação do tipo, por `schema_version`.

### Relações

O sentido é de quem produz para o que foi produzido.

```sql
create table event_event_relation (
  from_event_id char(26) not null references events (id) on delete cascade,
  to_event_id   char(26) not null references events (id) on delete cascade,
  relation      text not null,   -- generates | updates | deletes | step | precedes | follow_up
  created_at    timestamptz not null default now(),
  primary key (from_event_id, relation, to_event_id),
  check (from_event_id <> to_event_id)
);
create unique index event_event_reverse_idx on event_event_relation (to_event_id, relation, from_event_id);
-- cada continuação tem um só primeiro pedido
create unique index event_event_follow_up_unique on event_event_relation (to_event_id)
  where relation = 'follow_up';

create table event_artifact_relation (
  event_id        char(26) not null references events (id) on delete cascade,
  artifact_id     char(26) not null references artifacts (id) on delete cascade,
  relation        text not null,   -- creates | updates | uses | deletes
  position        smallint,        -- ordem na lista do evento; nulo em relação de passo de agente
  from_recurrence boolean not null default false,
  created_at      timestamptz not null default now(),
  primary key (event_id, artifact_id),                     -- uma linha por par
  unique (event_id, position) deferrable initially immediate,  -- reordenar num só UPDATE não colide
  check (position is null or position >= 0)
);
create index event_artifact_reverse_idx on event_artifact_relation (artifact_id, event_id);

create table artifact_artifact_relation (
  from_artifact_id char(26) not null references artifacts (id) on delete cascade,
  to_artifact_id   char(26) not null references artifacts (id) on delete cascade,
  relation         text not null,  -- derives (original -> cópia)
  created_at       timestamptz not null default now(),
  primary key (from_artifact_id, to_artifact_id, relation),
  check (from_artifact_id <> to_artifact_id)
);
-- uma cópia tem um só original
create unique index artifact_derives_copy_unique on artifact_artifact_relation (to_artifact_id)
  where relation = 'derives';
```

### Tags

```sql
create table tags (
  id         char(26) primary key,
  user_id    text not null,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  check (name = lower(btrim(name)) and name <> '')
);
create index tags_user_name_prefix_idx on tags (user_id, name text_pattern_ops);   -- sugestão por prefixo

create table event_tags (
  event_id char(26) not null references events (id) on delete cascade,
  tag_id   char(26) not null references tags (id) on delete cascade,
  primary key (event_id, tag_id)
);
create index event_tags_tag_idx on event_tags (tag_id, event_id);

create table artifact_tags (
  artifact_id char(26) not null references artifacts (id) on delete cascade,
  tag_id      char(26) not null references tags (id) on delete cascade,
  primary key (artifact_id, tag_id)
);
create index artifact_tags_tag_idx on artifact_tags (tag_id, artifact_id);
```

### Recorrência

`recurrences` fica como a tabela de hoje, com as mesmas colunas de regra e os mesmos checks, sem `target_kind`. O
`template` guarda o modelo do evento (tipo, nome, descrição, prioridade, tags, avisos) e a lista de artefatos que cada
ocorrência usa. Só eventos têm recorrência.

```sql
create index recurrences_user_idx on recurrences (user_id);
create index recurrences_pending_idx on recurrences (user_id, materialized_through);

create table recurrence_exceptions (
  recurrence_id char(26) not null references recurrences (id) on delete cascade,
  occurrence_on date not null,
  created_at    timestamptz not null default now(),
  primary key (recurrence_id, occurrence_on)
);
```

### `jobs`

Fila única. O job é descartável: a fonte de verdade é o evento.

```sql
create table jobs (
  id              char(26) primary key,
  kind            text not null,
  user_id         text not null,
  actor_id        text not null,
  event_id        char(26) references events (id) on delete cascade,  -- o passo que o job executa
  payload         jsonb not null,
  dedupe_key      text,
  concurrency_key text,            -- jobs com a mesma chave rodam um por vez, em ordem de criação
  status          text not null default 'queued',
  progress        jsonb,           -- retrato passageiro; some com o job
  error           text,
  attempts        integer not null default 0,
  lease_token     text,
  lease_until     timestamptz,
  available_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled'))
);

create unique index jobs_dedupe_unique on jobs (user_id, kind, dedupe_key);
create index jobs_queue_idx on jobs (available_at) where status = 'queued';          -- polling e retry
create index jobs_lease_idx on jobs (lease_until) where status = 'running';          -- lease vencido
create index jobs_event_idx on jobs (event_id) where event_id is not null;           -- cancelar pelo evento
create index jobs_concurrency_idx on jobs (concurrency_key, created_at, id)
  where concurrency_key is not null and status in ('queued', 'running');
create index jobs_finished_idx on jobs (updated_at)
  where status in ('succeeded', 'failed', 'cancelled');                              -- limpeza
```

Não há coluna `result`: o resultado mora no evento e nas entradas dele. Não há tabela de saída nem RabbitMQ.

### `idempotency_keys`

Igual à tabela de hoje: chave primária `(user_id, scope, key)`, `request_hash`, `response` e índice em `created_at`
para a limpeza. Passa a guardar também o reenvio da mesma mensagem à IA, que hoje depende do `dedupe_key` do job.

## Consulta de cada tela

| Leitura | Como consulta | Índice |
|---|---|---|
| Janela da agenda | eventos com `started_at` entre `from - 31 dias` e `to`, cujo fim é `>= from` | `events_agenda_idx` |
| Agenda só de pessoa ou só de agente | a mesma, com filtro por `actor` | `events_agenda_idx` |
| Lista de tarefas, por status e data | `status`, depois `coalesce(started_at, estimated_finish_at)` | `events_tracked_idx` |
| Lista de tarefas só de pessoa ou só de agente | a mesma, com filtro por `actor` | `events_tracked_idx` |
| Eventos longos e prazos | lista de tarefas com `long_running` | `events_tracked_idx` |
| Série na lista de tarefas | a primeira ocorrência em aberto de cada série do usuário | `recurrences_user_idx`, `events_recurrence_occurrence_unique` |
| Lista de pedidos | eventos de agente sem passos, por id decrescente | `events_requests_idx` |
| Busca por nome e agente de consulta | todos os eventos vivos de pessoa do usuário | `events_user_live_idx` |
| Um pedido com passos | relação `step` a partir do pedido | chave primária de `event_event_relation` |
| Entradas de um pedido ou passo | por `event_id`, em ordem de id; incremental com `id > último` | `event_entries_event_idx` |
| O que um passo tocou | relações a partir do passo | chaves primárias das duas relações |
| Sessão inteira | `follow_up` a partir do primeiro pedido | chave primária de `event_event_relation` |
| Sequência ("segue-se de" e "da sequência a") | por origem ou por destino; em profundidade, consulta recursiva | chave primária e `event_event_reverse_idx` |
| Em quais eventos um artefato aparece | por `artifact_id` | `event_artifact_reverse_idx` |
| Lista de artefatos por tipo | por `updated_at` decrescente, sem cópias | `artifacts_user_type_recent_idx` |
| Catálogo global de alimentos e exercícios | por tipo e nome | `artifacts_global_idx` |
| Calorias de uma refeição | soma sobre os alimentos que o evento usa | chave primária de `event_artifact_relation` |
| Filtro por tag | por tag, ou por evento dentro da janela | `event_tags_tag_idx`, chave primária |
| Ocorrências de uma série | por `recurrence_id` e `occurrence_on` | `events_recurrence_occurrence_unique` |

O fim de um evento na agenda é `coalesce(estimated_finish_at, finished_at, started_at)`: um evento de agente não tem
fim planejado, então vale a conclusão real.

Os avisos são calculados no cliente, a partir da janela da agenda e da lista de acompanhados. Um aviso enviado pelo
servidor pediria uma coluna própria com o próximo horário de aviso.

## O que o cartão das listas lê

A agenda e a lista de tarefas usam o mesmo cartão, desenhado no canvas "Entidade única — agenda e tarefas" (rodada
2). O evento de pessoa fica direto no fundo da tela; o evento de agente ganha um cartão em verde-água. Todo tipo
aparece escrito ao lado do ícone, seja de pessoa ou de agente.

| No cartão | De onde vem |
|---|---|
| Glifo de status | `status` e `actor`; sem status, é o evento de referência |
| Título | `name` |
| Ícone e texto do tipo | `kind`, escrito como o código (`meal`, `cron`, `search_request`), em fonte mono |
| Horário ("07:00 — 08:00") | `started_at` e `estimated_finish_at` |
| Só o dia ("Hoje") | `started_at` à meia-noite local, que significa dia sem horário |
| Duração ou data à direita | `estimated_finish_at - started_at`; sem horário, o dia de `started_at` ou o prazo |
| Regra da série ("Todo dia, 18:00") | `recurrences`, por `recurrence_id` |
| Tempo decorrido ("há 12 min") | `started_at` do pedido |
| "Não realizado" | `status = 'missed'` |
| Tags | `event_tags` |
| Cartão em verde-água | `actor = 'agent'` |

Nenhum campo do cartão pede coluna nova.

Na lista de tarefas, uma série aparece uma vez só: pela próxima ocorrência em aberto, com a regra no lugar do
horário. Na agenda, cada ocorrência aparece no seu dia.

## Regras que ficam no código

- **Revisão ao mexer numa relação.** Criar, remover ou reordenar uma relação com artefato conta como editar o evento de origem,
  quando ele é de pessoa: a escrita exige a `revision` esperada dele, incrementa-a e, se ele for ocorrência de uma
  série, destaca-o da série. O destino nunca é tocado. Relações que partem de evento de agente e a relação `derives`
  não incrementam nada, e as relações que a série cria ao gerar uma ocorrência fazem parte da criação dela. A sequência `precedes` também não revisa ninguém.
- **Dono das pontas.** As duas pontas de uma relação pertencem ao mesmo usuário, ou a ponta é um artefato global.
- **Ciclos.** `precedes` não pode fechar ciclo. A conferência usa consulta recursiva, sob a trava por
  usuário que já existe.
- **Sequência informativa.** `precedes` não segura nem libera ninguém e não revisa nenhum dos dois eventos ([ADR 0014](../adr/0014-sequencia-entre-eventos-no-lugar-de-subtarefa-e-bloqueio.md)).
- **Forma do grafo de IA.** Um passo tem exatamente um pedido, e `follow_up` só liga pedidos.
- **Job de IA.** Todo job de IA tem `event_id`. O conjunto de tipos de job de IA é do código.
- **"Agendada" e "atrasado"** são calculados na tela. `missed` é marca manual.
- **Dia sem horário.** Um evento que tem dia mas não tem hora grava `started_at` à meia-noite local. É a convenção
  que as tarefas já usam hoje; um evento que começa de fato à meia-noite não se distingue dele.
- **Esquema do agente de consulta.** Filtra `actor = 'human'` e expõe a sequência (`event_sequence`) e os artefatos do evento como
  visões nomeadas, não como o grafo de relações.
- **Ordem das entradas.** O ULID é gerado de forma monotônica dentro de um processo.

## Tabelas que saem

`tasks`, `task_tags`, `task_dependencies`, `event_tasks`, `notes`, `note_tags`, `event_notes`, `task_notes`,
`recurrence_notes`, `event_interruptions`, `food`, `meal`, `workout`, `ai_jobs`, `ai_job_outbox`, `ai_processes`,
`ai_process_steps`, `ai_process_entities`, `ai_turn_traces`, `agent_conversations`, `agent_chat_messages`,
`agent_chat_tickets`.

## Questões em aberto

- O chat de hoje não tem lista de sessões nem histórico: as mensagens vivem só na tela aberta. Se uma lista de
  sessões vier a existir, ordenar por atividade recente exige agregar as continuações de cada primeiro pedido.
- Por quanto tempo guardar passos, pensamentos e traces. Os jobs terminados já têm prazo: o worker os apaga 7 dias
  depois de terminarem.
- O controle de "finalizado" por entidade tocada, que por ora é uma entrada de resultado do passo.
- Se o agente de consulta vai ler mensagens antigas. Em caso positivo, falta um índice em `event_entries` por usuário,
  só para mensagens.
