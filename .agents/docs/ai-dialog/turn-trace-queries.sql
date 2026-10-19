-- Consultas sobre ai_turn_traces para responder as perguntas da fase 1 (ADR 002).
-- Uma linha = uma tentativa de turno. Nenhum texto de usuario ou de modelo e gravado.

-- 1. Fracao dos turnos que caiu em `complex` e por que (JEV).
SELECT route, route_decision->>'fallbackReason' AS motivo, count(*) AS turnos,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM ai_turn_traces WHERE created_at > now() - interval '7 days'
GROUP BY 1, 2 ORDER BY turnos DESC;

-- 2. Onde o tempo vai (ms): p50/p95 por etapa. agent inclui reads; modelo = agent - reads.
SELECT route,
  percentile_cont(0.5)  WITHIN GROUP (ORDER BY (stages->>'routeMs')::int)  AS route_p50,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY (stages->>'routeMs')::int)  AS route_p95,
  percentile_cont(0.5)  WITHIN GROUP (ORDER BY (stages->>'agentMs')::int)  AS agent_p50,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY (stages->>'agentMs')::int)  AS agent_p95,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY (stages->>'readsMs')::int)  AS reads_p95,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY (stages->>'commandsMs')::int) AS commands_p95,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY total_ms)                   AS total_p95,
  count(*) AS turnos
FROM ai_turn_traces WHERE created_at > now() - interval '7 days'
GROUP BY route ORDER BY turnos DESC;

-- 3. Retentativas e espera: turnos com mais de uma tentativa e quanto o usuario esperou.
SELECT job_id, count(*) AS tentativas, max(since_submitted_ms) AS espera_ms,
       array_agg(outcome ORDER BY attempt) AS desfechos
FROM ai_turn_traces WHERE job_id IS NOT NULL AND created_at > now() - interval '7 days'
GROUP BY job_id HAVING count(*) > 1 ORDER BY espera_ms DESC LIMIT 50;

-- 4. Desfechos e erros por rota.
SELECT route, outcome, error_code, count(*) AS turnos
FROM ai_turn_traces WHERE created_at > now() - interval '7 days'
GROUP BY 1, 2, 3 ORDER BY turnos DESC;

-- 5. Ferramentas mais lentas (reads) dentro dos turnos.
SELECT t->>'name' AS ferramenta, count(*) AS chamadas,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY (t->>'ms')::int) AS p95_ms,
       count(*) FILTER (WHERE (t->>'ok')::boolean = false) AS falhas
FROM ai_turn_traces, jsonb_array_elements(tools) AS t
WHERE created_at > now() - interval '7 days' GROUP BY 1 ORDER BY p95_ms DESC;

-- 6. Legado x rapido: latencia, desfecho e por que o rapido nao cobriu o pedido.
SELECT pipeline, outcome, coalesce(fast_fallback, '-') AS fast_fallback, count(*) AS turnos,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY total_ms) AS p50_ms,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY total_ms) AS p95_ms
FROM ai_turn_traces WHERE created_at > now() - interval '7 days'
GROUP BY 1, 2, 3 ORDER BY turnos DESC;

-- Retencao sugerida (rodar periodicamente):
-- DELETE FROM ai_turn_traces WHERE created_at < now() - interval '30 days';
