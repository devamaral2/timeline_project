-- Consulta pronta usada pela ferramenta get_day_context.
-- $1 = userId autenticado (nunca fornecido pelo modelo)
-- $2 = dia civil YYYY-MM-DD, validado pela API
-- Executar como consulta parametrizada, em transacao READ ONLY.
-- Os limites usam America/Sao_Paulo em cada meia-noite para lidar com DST.
-- Nao enviar este SQL para query_data: aquela ferramenta proibe parametros.

WITH bounds AS (
  SELECT
    $2::date AS day,
    ($2::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AS day_start,
    (($2::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AS day_end
),
day_events AS MATERIALIZED (
  SELECT e.*
  FROM events e CROSS JOIN bounds b
  WHERE e.user_id = $1
    AND e.deleted_at IS NULL
    AND e.started_at < b.day_end
    AND (
      e.started_at >= b.day_start
      OR e.finished_at IS NULL
      OR e.finished_at > b.day_start
    )
),
day_tasks AS MATERIALIZED (
  SELECT t.*
  FROM tasks t
  WHERE t.user_id = $1
    AND t.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM event_tasks et JOIN day_events e ON e.id = et.event_id
      WHERE et.task_id = t.id
    )
),
day_notes AS MATERIALIZED (
  SELECT n.*
  FROM notes n
  WHERE n.user_id = $1
    AND n.deleted_at IS NULL
    AND (
      EXISTS (SELECT 1 FROM day_events e WHERE e.id = n.event_id)
      OR EXISTS (SELECT 1 FROM day_tasks t WHERE t.id = n.task_id)
    )
)
SELECT jsonb_build_object(
  'date', b.day,
  'timeZone', 'America/Sao_Paulo',
  'events', (
    SELECT COALESCE(jsonb_agg(
      (to_jsonb(e) - 'user_id' - 'deleted_at') || jsonb_build_object(
        'items', (
          SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.position), '[]'::jsonb)
          FROM event_items i WHERE i.event_id = e.id
        ),
        'interruptions', (
          SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.position), '[]'::jsonb)
          FROM event_interruptions x WHERE x.event_id = e.id
        ),
        'tags', (
          SELECT COALESCE(jsonb_agg(g.name ORDER BY g.name), '[]'::jsonb)
          FROM event_tags et JOIN tags g ON g.id = et.tag_id
          WHERE et.event_id = e.id AND g.user_id = $1
        ),
        'taskIds', (
          SELECT COALESCE(jsonb_agg(et.task_id ORDER BY et.task_id), '[]'::jsonb)
          FROM event_tasks et WHERE et.event_id = e.id
        )
      ) ORDER BY e.started_at, e.id
    ), '[]'::jsonb)
    FROM day_events e
  ),
  'tasks', (
    SELECT COALESCE(jsonb_agg(
      (to_jsonb(t) - 'user_id' - 'deleted_at') || jsonb_build_object(
        'tags', (
          SELECT COALESCE(jsonb_agg(g.name ORDER BY g.name), '[]'::jsonb)
          FROM task_tags tt JOIN tags g ON g.id = tt.tag_id
          WHERE tt.task_id = t.id AND g.user_id = $1
        ),
        'dependsOnTaskIds', (
          SELECT COALESCE(jsonb_agg(d.depends_on_task_id ORDER BY d.depends_on_task_id), '[]'::jsonb)
          FROM task_dependencies d WHERE d.task_id = t.id
        )
      ) ORDER BY t.started_at NULLS LAST, t.id
    ), '[]'::jsonb)
    FROM day_tasks t
  ),
  'notes', (
    SELECT COALESCE(jsonb_agg(
      (to_jsonb(n) - 'user_id' - 'deleted_at') || jsonb_build_object(
        'tags', (
          SELECT COALESCE(jsonb_agg(g.name ORDER BY g.name), '[]'::jsonb)
          FROM note_tags nt JOIN tags g ON g.id = nt.tag_id
          WHERE nt.note_id = n.id AND g.user_id = $1
        )
      ) ORDER BY n.created_at, n.id
    ), '[]'::jsonb)
    FROM day_notes n
  )
) AS day_context
FROM bounds b;
