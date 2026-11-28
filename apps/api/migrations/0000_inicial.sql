-- O banco da API em SQLite (ADR 0024). Nasce do estado final das migrations do Postgres (0000 a 0014),
-- sem os dados: producao recomeca vazia.
--
-- Tipos:
--   ids            TEXT (ULID gerado na aplicacao)
--   data e hora    TEXT ISO-8601 em UTC com milissegundos ('2026-11-27T13:00:00.000Z'), a forma de
--                  `Date.toISOString()` e de `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`. Largura fixa: comparar
--                  como texto e comparar no tempo.
--   dia            TEXT 'YYYY-MM-DD'; hora do dia TEXT 'HH:MM:SS'
--   JSON           TEXT, com o formato conferido no CHECK
--   booleano       INTEGER 0 ou 1
--
-- O que o Postgres conferia e o SQLite nao confere: um CHECK nao aceita subconsulta, entao o intervalo de cada
-- aviso em `notify_offsets_minutes` fica so no dominio (`Task`). `lower()` so baixa letras ASCII.

CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  personal INTEGER NOT NULL DEFAULT 0 CHECK (personal IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT projects_name_shape CHECK (name = trim(name) AND length(name) BETWEEN 1 AND 60),
  CONSTRAINT projects_personal_name CHECK (NOT personal OR name = 'diario')
);
CREATE UNIQUE INDEX projects_user_name_unique ON projects (user_id, lower(name));
CREATE UNIQUE INDEX projects_user_personal_unique ON projects (user_id) WHERE personal;

CREATE TABLE recurrences (
  id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects (id),
  freq TEXT NOT NULL,
  interval_count INTEGER NOT NULL DEFAULT 1,
  byweekday INTEGER,
  bymonthday INTEGER,
  bymonth INTEGER,
  time_of_day TEXT NOT NULL,
  duration_minutes INTEGER,
  time_zone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  template TEXT NOT NULL,
  materialized_through TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT recurrences_revision_min CHECK (revision >= 1),
  CONSTRAINT recurrences_freq_valid CHECK (freq IN ('daily', 'weekly', 'monthly', 'yearly')),
  CONSTRAINT recurrences_interval_min CHECK (interval_count >= 1),
  CONSTRAINT recurrences_byweekday_range CHECK (byweekday IS NULL OR byweekday BETWEEN 1 AND 127),
  CONSTRAINT recurrences_bymonthday_range CHECK (bymonthday IS NULL OR bymonthday BETWEEN 1 AND 31),
  CONSTRAINT recurrences_bymonth_range CHECK (bymonth IS NULL OR bymonth BETWEEN 1 AND 12),
  CONSTRAINT recurrences_byweekday_shape CHECK ((freq = 'weekly') = (byweekday IS NOT NULL)),
  CONSTRAINT recurrences_bymonthday_shape CHECK ((freq IN ('monthly', 'yearly')) = (bymonthday IS NOT NULL)),
  CONSTRAINT recurrences_bymonth_shape CHECK ((freq = 'yearly') = (bymonth IS NOT NULL)),
  CONSTRAINT recurrences_duration_positive CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  CONSTRAINT recurrences_ends_after_starts CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT recurrences_template_object CHECK (json_valid(template) AND json_type(template) = 'object')
);
CREATE INDEX recurrences_user_idx ON recurrences (user_id);
CREATE INDEX recurrences_pending_idx ON recurrences (user_id, materialized_through);

CREATE TABLE recurrence_exceptions (
  recurrence_id TEXT NOT NULL REFERENCES recurrences (id) ON DELETE CASCADE,
  occurrence_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (recurrence_id, occurrence_on)
);

-- O que uma pessoa ou um agente faz ou vai fazer (ADR 0011). `started_at` e o inicio planejado,
-- `estimated_finish_at` o fim planejado e `finished_at` a conclusao real.
CREATE TABLE tasks (
  id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  user_id TEXT NOT NULL,
  -- Sem cascade: um projeto com tarefas nao se apaga.
  project_id TEXT NOT NULL REFERENCES projects (id),
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT,
  situation TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location TEXT,
  started_at TEXT,
  estimated_finish_at TEXT,
  finished_at TEXT,
  notify_offsets_minutes TEXT NOT NULL DEFAULT '[]',
  -- `set null`: apagar a regra nao apaga o que ja aconteceu.
  recurrence_id TEXT REFERENCES recurrences (id) ON DELETE SET NULL,
  occurrence_on TEXT,
  recurrence_detached INTEGER NOT NULL DEFAULT 0 CHECK (recurrence_detached IN (0, 1)),
  long_running INTEGER NOT NULL DEFAULT 0 CHECK (long_running IN (0, 1)),
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT,
  CONSTRAINT tasks_revision_min CHECK (revision >= 1),
  CONSTRAINT tasks_actor_valid CHECK (actor IN ('human', 'agent')),
  CONSTRAINT tasks_priority_valid CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
  CONSTRAINT tasks_kind_matches_actor CHECK (
    (actor = 'human' AND kind IN ('common', 'meal', 'sleep', 'training'))
    OR (actor = 'agent' AND kind IN ('request', 'save_content', 'save_content_with_transcription', 'search_request',
      'build_request', 'inquiry_request', 'review_request', 'cron', 'step'))
  ),
  CONSTRAINT tasks_status_matches_actor CHECK (
    (actor = 'human' AND (status IS NULL OR status IN ('todo', 'toDefine', 'doing', 'inHold', 'done', 'cancel', 'missed')))
    OR (actor = 'agent' AND status IS NOT NULL AND status IN ('preparing', 'queued', 'starting', 'running', 'waiting',
      'awaiting_transcription', 'completed', 'interrupted', 'failed', 'cancelled', 'rolled_back'))
  ),
  CONSTRAINT tasks_situation_valid CHECK (situation IS NULL OR situation IN ('to_review', 'reviewed', 'bookmarked')),
  CONSTRAINT tasks_situation_shape CHECK (
    situation IS NULL
    OR (actor = 'agent' AND kind NOT IN ('step', 'cron', 'save_content', 'save_content_with_transcription')
      AND status IN ('completed', 'interrupted', 'failed', 'cancelled', 'rolled_back'))
  ),
  CONSTRAINT tasks_long_running_shape CHECK (
    NOT long_running OR (actor = 'human' AND status IS NOT NULL AND status <> 'missed' AND recurrence_id IS NULL)
  ),
  CONSTRAINT tasks_notify_offsets_array CHECK (
    json_valid(notify_offsets_minutes) AND json_type(notify_offsets_minutes) = 'array'
  ),
  CONSTRAINT tasks_long_running_notify CHECK (
    NOT long_running OR estimated_finish_at IS NOT NULL OR json_array_length(notify_offsets_minutes) = 0
  ),
  CONSTRAINT tasks_block_span CHECK (
    long_running OR started_at IS NULL OR estimated_finish_at IS NULL
    OR (estimated_finish_at >= started_at AND julianday(estimated_finish_at) - julianday(started_at) <= 31)
  ),
  CONSTRAINT tasks_occurrence_requires_day CHECK (recurrence_id IS NULL OR occurrence_on IS NOT NULL),
  CONSTRAINT tasks_location_human CHECK (location IS NULL OR actor = 'human'),
  CONSTRAINT tasks_location_filled CHECK (location IS NULL OR trim(location) <> ''),
  CONSTRAINT tasks_location_length CHECK (location IS NULL OR length(location) <= 300),
  CONSTRAINT tasks_data_object CHECK (json_valid(data) AND json_type(data) = 'object')
);
-- Agenda: pessoa e agente, sem passos, sem conteudo guardado (ADR 0021) e sem tarefas longas.
CREATE INDEX tasks_agenda_idx ON tasks (user_id, started_at, id)
  WHERE started_at IS NOT NULL AND NOT long_running
    AND kind NOT IN ('step', 'save_content', 'save_content_with_transcription') AND deleted_at IS NULL;
-- Lista de tarefas: tudo o que tem status, de pessoa e de agente, sem passos.
CREATE INDEX tasks_tracked_idx ON tasks (user_id, status, coalesce(started_at, estimated_finish_at), id)
  WHERE status IS NOT NULL AND kind <> 'step' AND deleted_at IS NULL;
-- Pedidos do usuario, do mais novo para o mais antigo.
CREATE INDEX tasks_requests_idx ON tasks (user_id, id DESC)
  WHERE actor = 'agent' AND kind <> 'step' AND deleted_at IS NULL;
-- Todas as tarefas vivas de pessoa: agente de consulta e busca por nome.
CREATE INDEX tasks_user_live_idx ON tasks (user_id, id) WHERE actor = 'human' AND deleted_at IS NULL;
-- A garantia de idempotencia da materializacao, sem filtro de apagados: a ocorrencia apagada continua ocupando o dia.
CREATE UNIQUE INDEX tasks_recurrence_occurrence_unique ON tasks (recurrence_id, occurrence_on)
  WHERE recurrence_id IS NOT NULL;

-- O que se acrescenta a uma tarefa e nunca se altera (ADR 0013). O id e um ULID e da a ordem.
CREATE TABLE task_entries (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  role TEXT,
  content TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT task_entries_kind_valid CHECK (kind IN ('message', 'thought', 'trace', 'result', 'input')),
  CONSTRAINT task_entries_role_only_in_message CHECK ((kind = 'message') = (role IS NOT NULL)),
  CONSTRAINT task_entries_role_valid CHECK (role IS NULL OR role IN ('user', 'agent')),
  -- O trace guarda so numeros e codigos, em `data`: nunca texto do usuario.
  CONSTRAINT task_entries_trace_without_text CHECK (kind <> 'trace' OR content IS NULL),
  CONSTRAINT task_entries_data_object CHECK (json_valid(data) AND json_type(data) = 'object')
);
CREATE INDEX task_entries_task_idx ON task_entries (task_id, id);

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  -- Nulo e o catalogo global (exercicios e alimentos).
  user_id TEXT,
  type TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  derived INTEGER NOT NULL DEFAULT 0 CHECK (derived IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT,
  CONSTRAINT artifacts_revision_min CHECK (revision >= 1),
  CONSTRAINT artifacts_schema_version_min CHECK (schema_version >= 1),
  CONSTRAINT artifacts_type_valid CHECK (type IN ('text', 'news', 'email_summary', 'youtube_transcript', 'food',
    'sleep', 'training', 'workout', 'skill', 'agent', 'router')),
  CONSTRAINT artifacts_global_only_catalog CHECK (user_id IS NOT NULL OR type IN ('food', 'workout')),
  CONSTRAINT artifacts_data_object CHECK (json_valid(data) AND json_type(data) = 'object')
);
CREATE INDEX artifacts_user_type_recent_idx ON artifacts (user_id, type, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL AND NOT derived;
CREATE INDEX artifacts_global_idx ON artifacts (type, name) WHERE user_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX artifacts_workout_code_unique ON artifacts (data ->> 'code')
  WHERE type = 'workout' AND user_id IS NULL;
-- Um arquivo de skill ou de agente por caminho (ADR 0005).
CREATE UNIQUE INDEX artifacts_agent_file_unique ON artifacts (user_id, data ->> 'path')
  WHERE type IN ('skill', 'agent') AND deleted_at IS NULL;

CREATE TABLE tags (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT tags_user_name_unique UNIQUE (user_id, name),
  CONSTRAINT tag_name_normalized CHECK (name = lower(trim(name)) AND name <> '')
);

CREATE TABLE task_tags (
  task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);
CREATE INDEX task_tags_tag_idx ON task_tags (tag_id, task_id);

CREATE TABLE artifact_tags (
  artifact_id TEXT NOT NULL REFERENCES artifacts (id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (artifact_id, tag_id)
);
CREATE INDEX artifact_tags_tag_idx ON artifact_tags (tag_id, artifact_id);

-- Relacoes no sentido de quem produz (ADR 0012).
CREATE TABLE task_task_relation (
  from_task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  to_task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (from_task_id, relation, to_task_id),
  CONSTRAINT task_task_not_self CHECK (from_task_id <> to_task_id),
  CONSTRAINT task_task_relation_valid CHECK (relation IN ('generates', 'updates', 'deletes', 'step', 'subtask', 'follow_up'))
);
CREATE UNIQUE INDEX task_task_reverse_idx ON task_task_relation (to_task_id, relation, from_task_id);
-- Uma principal por subtarefa e uma sessao por pedido.
CREATE UNIQUE INDEX task_task_subtask_unique ON task_task_relation (to_task_id) WHERE relation = 'subtask';
CREATE UNIQUE INDEX task_task_follow_up_unique ON task_task_relation (to_task_id) WHERE relation = 'follow_up';

-- `position` e a ordem na lista da tarefa e fica nula na relacao de um passo de agente. As relacoes de uma tarefa
-- sao apagadas e regravadas juntas, entao o UNIQUE nao precisa ser adiado.
CREATE TABLE task_artifact_relation (
  task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  artifact_id TEXT NOT NULL REFERENCES artifacts (id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  position INTEGER,
  from_recurrence INTEGER NOT NULL DEFAULT 0 CHECK (from_recurrence IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (task_id, artifact_id),
  CONSTRAINT task_artifact_task_position_unique UNIQUE (task_id, position),
  CONSTRAINT task_artifact_relation_valid CHECK (relation IN ('creates', 'updates', 'uses', 'deletes')),
  CONSTRAINT task_artifact_position_nonneg CHECK (position IS NULL OR position >= 0)
);
CREATE INDEX task_artifact_reverse_idx ON task_artifact_relation (artifact_id, task_id);

CREATE TABLE artifact_artifact_relation (
  from_artifact_id TEXT NOT NULL REFERENCES artifacts (id) ON DELETE CASCADE,
  to_artifact_id TEXT NOT NULL REFERENCES artifacts (id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (from_artifact_id, to_artifact_id, relation),
  CONSTRAINT artifact_artifact_not_self CHECK (from_artifact_id <> to_artifact_id),
  CONSTRAINT artifact_artifact_relation_valid CHECK (relation = 'derives')
);
-- Uma copia deriva de um artefato so.
CREATE UNIQUE INDEX artifact_derives_copy_unique ON artifact_artifact_relation (to_artifact_id) WHERE relation = 'derives';

-- A fila unica de jobs (ADR 0013). Com um escritor so, `BEGIN IMMEDIATE` faz o papel do `SKIP LOCKED`.
CREATE TABLE jobs (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  user_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  task_id TEXT REFERENCES tasks (id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  dedupe_key TEXT,
  concurrency_key TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  progress TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until TEXT,
  available_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT jobs_status_valid CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  CONSTRAINT jobs_payload_json CHECK (json_valid(payload)),
  CONSTRAINT jobs_progress_json CHECK (progress IS NULL OR json_valid(progress))
);
CREATE UNIQUE INDEX jobs_dedupe_unique ON jobs (user_id, kind, dedupe_key);
CREATE INDEX jobs_queue_idx ON jobs (available_at) WHERE status = 'queued';
CREATE INDEX jobs_lease_idx ON jobs (lease_until) WHERE status = 'running';
CREATE INDEX jobs_task_idx ON jobs (task_id) WHERE task_id IS NOT NULL;
CREATE INDEX jobs_concurrency_idx ON jobs (concurrency_key, created_at, id)
  WHERE concurrency_key IS NOT NULL AND status IN ('queued', 'running');
CREATE INDEX jobs_finished_idx ON jobs (updated_at) WHERE status IN ('succeeded', 'failed', 'cancelled');

CREATE TABLE idempotency_keys (
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, scope, key),
  CONSTRAINT idempotency_keys_response_json CHECK (response IS NULL OR json_valid(response))
);
CREATE INDEX idempotency_keys_created_idx ON idempotency_keys (created_at);

-- O catalogo global de exercicios.
INSERT INTO artifacts (id, user_id, type, name, data) VALUES
  ('01KDVDNA00D5NXMHPDBZATY4WT', NULL, 'workout', 'Esteira', '{"code":"treadmill","category":"cardio","active":true}'),
  ('01KDVDNA0124XD880E1MH1WADH', NULL, 'workout', 'Corrida', '{"code":"running","category":"cardio","active":true}'),
  ('01KDVDNA02J6RBHR6VX58P4NZG', NULL, 'workout', 'Caminhada', '{"code":"walking","category":"cardio","active":true}'),
  ('01KDVDNA0345S64WHDKJ31Q9WJ', NULL, 'workout', 'Musculação', '{"code":"weightlifting","category":"strength","active":true}'),
  ('01KDVDNA042EV5NBHZMEM0PC6X', NULL, 'workout', 'Livre', '{"code":"free","category":"free","active":true}');
