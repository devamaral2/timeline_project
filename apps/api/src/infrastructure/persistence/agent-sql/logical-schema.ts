import { type SqlFragment, sql } from "@repo/sqlite";

/**
 * As tabelas que a query do agente enxerga. E a fonte unica de duas coisas que
 * precisam bater: o SELECT que copia as linhas do usuario para o banco
 * descartavel de cada consulta e a descricao que vai para o prompt.
 *
 * O isolamento e por construcao: a consulta do agente roda num banco em
 * memoria que so tem as linhas deste usuario (ja sem apagadas) e so as colunas
 * listadas aqui. Nao ha filtro para a query contornar, nem coluna de dono para
 * ela pedir. Cada `select` recebe o id do usuario e filtra pelo dono, juntando
 * com o pai quando a tabela filha nao tem `user_id` proprio.
 *
 * So entram as tarefas de pessoa e os artefatos: os pedidos ao agente, os
 * passos e as entradas deles ficam de fora. As relacoes aparecem como visoes
 * com nome (`task_subtasks`, `task_artifacts`), e nao como o grafo de
 * relacoes.
 *
 * Tipos: `timestamp` e `date` sao TEXT (ISO-8601 em UTC com milissegundos e
 * `YYYY-MM-DD`); `boolean` e INTEGER 0/1; `json` e TEXT com JSON.
 */
export type LogicalType = "text" | "integer" | "boolean" | "timestamp" | "date" | "json";

export interface LogicalColumn {
  name: string;
  type: LogicalType;
  description?: string;
}

export interface LogicalTable {
  name: string;
  description: string;
  columns: LogicalColumn[];
  /** Le do banco da API as linhas do usuario, com as colunas acima, na mesma ordem e com os mesmos nomes. */
  select(userId: string): SqlFragment;
}

const ARTIFACT_DATA_DESCRIPTION = [
  "texto JSON (use json_extract ou ->>); formato depende de type:",
  "text → {body};",
  "sleep → {trackedSleepTime: minutos, score: 0-100};",
  "food → {description, quantity?: quanto foi comido, totals: {totalCaloriesKcal, totalProteinGrams, totalCarbohydrateGrams, totalFatGrams, totalFiberGrams},",
  "items: [{name, portion, approximateWeightGrams, caloriesKcal, macronutrients: {carbohydratesGrams, proteinsGrams, totalFatGrams, fiberGrams}}],",
  "recipe?: {source: user|model, servings?, prepTimeMinutes?, ingredients: [{name, quantity}], steps: [texto]}};",
  "training → {caloriesBurned, workouts: [{workoutCode: walking|running|treadmill|weightlifting|free, workoutName, calories, duration: minutos,",
  "pace?: min/km, distance?: km, sets?: [{exercise, repetitions, weight: kg}]}]};",
  "workout → {code, category: cardio|strength|free}",
].join(" ");

/** Os tipos de artefato que guardam conteudo do usuario. Os arquivos do agente ficam de fora. */
const VISIBLE_ARTIFACT_TYPES = sql.list(["text", "food", "sleep", "training", "workout"]);
const visibleArtifact = (userId: string) =>
  sql`a.deleted_at IS NULL AND (a.user_id = ${userId} OR a.user_id IS NULL) AND a.type IN (${VISIBLE_ARTIFACT_TYPES})`;
const visibleTask = (alias: string, userId: string) =>
  sql`${sql.raw(alias)}.user_id = ${userId} AND ${sql.raw(alias)}.actor = 'human' AND ${sql.raw(alias)}.deleted_at IS NULL`;

const TABLES: readonly LogicalTable[] = [
  {
    name: "tasks",
    description:
      "Tarefas do usuario (passado, agora ou futuro; podem se sobrepor). Com status, a tarefa e acompanhada na lista de tarefas; sem status, e tarefa de referencia e so marca um horario na agenda.",
    columns: [
      { name: "id", type: "text" },
      { name: "name", type: "text" },
      { name: "project", type: "text", description: "nome do projeto da tarefa; `diario` quando nenhum foi escolhido" },
      { name: "description", type: "text" },
      { name: "location", type: "text", description: "onde a tarefa acontece; nulo se ninguem informou" },
      { name: "kind", type: "text", description: "common | meal | sleep | training" },
      {
        name: "status",
        type: "text",
        description: "nulo = tarefa de referencia, que so marca um horario; senao todo | toDefine | doing | inHold | done | cancel | missed (nao realizado)",
      },
      { name: "priority", type: "text", description: "urgent | high | medium | low" },
      { name: "started_at", type: "timestamp", description: "inicio planejado; nulo se nao tem" },
      { name: "started_on", type: "date", description: "dia de started_at em America/Sao_Paulo (UTC-03:00)" },
      {
        name: "estimated_finish_at",
        type: "timestamp",
        description: "fim planejado: o fim do bloco na agenda ou, na tarefa longa, o prazo",
      },
      { name: "finished_at", type: "timestamp", description: "conclusao real; nulo se nao terminou" },
      { name: "long_running", type: "boolean", description: "tarefa longa: fica fora da agenda e sempre tem status" },
      { name: "recurrence_id", type: "text", description: "serie de origem, se for ocorrencia" },
      { name: "occurrence_on", type: "date" },
      { name: "created_at", type: "timestamp" },
      { name: "updated_at", type: "timestamp" },
    ],
    select: (userId) => sql`
      SELECT e.id, e.name, pr.name AS project, e.description, e.location, e.kind, e.status, e.priority,
             e.started_at, date(e.started_at, '-3 hours') AS started_on, e.estimated_finish_at, e.finished_at,
             e.long_running, e.recurrence_id, e.occurrence_on, e.created_at, e.updated_at
      FROM tasks e JOIN projects pr ON pr.id = e.project_id
      WHERE ${visibleTask("e", userId)}`,
  },
  {
    name: "task_subtasks",
    description:
      "Hierarquia entre tarefas: subtask_id e subtarefa de parent_task_id (a tarefa principal). Cada tarefa tem no maximo uma principal e pode ter varias subtarefas.",
    columns: [
      { name: "parent_task_id", type: "text" },
      { name: "subtask_id", type: "text" },
    ],
    select: (userId) => sql`
      SELECT r.from_task_id AS parent_task_id, r.to_task_id AS subtask_id
      FROM task_task_relation r JOIN tasks p ON p.id = r.from_task_id JOIN tasks c ON c.id = r.to_task_id
      WHERE r.relation = 'subtask' AND ${visibleTask("p", userId)} AND ${visibleTask("c", userId)}`,
  },
  {
    name: "task_artifacts",
    description: "Artefatos de uma tarefa, na ordem em que aparecem (position). Um artefato pode estar em varias tarefas.",
    columns: [
      { name: "task_id", type: "text" },
      { name: "artifact_id", type: "text" },
      { name: "relation", type: "text", description: "o que a tarefa fez com o artefato: creates | updates | uses | deletes" },
      { name: "position", type: "integer" },
    ],
    select: (userId) => sql`
      SELECT l.task_id, l.artifact_id, l.relation, l.position
      FROM task_artifact_relation l JOIN tasks e ON e.id = l.task_id JOIN artifacts a ON a.id = l.artifact_id
      WHERE ${visibleTask("e", userId)} AND ${visibleArtifact(userId)}`,
  },
  {
    name: "task_tags",
    description: "Tags de cada tarefa.",
    columns: [
      { name: "task_id", type: "text" },
      { name: "tag", type: "text" },
    ],
    select: (userId) => sql`
      SELECT et.task_id, t.name AS tag
      FROM task_tags et JOIN tags t ON t.id = et.tag_id JOIN tasks e ON e.id = et.task_id
      WHERE ${visibleTask("e", userId)} AND t.user_id = ${userId}`,
  },
  {
    name: "recurrences",
    description:
      "Series recorrentes. Cada ocorrencia e uma linha em tasks com recurrence_id apontando para ca; so as dos proximos dias ja foram geradas.",
    columns: [
      { name: "id", type: "text" },
      { name: "name", type: "text", description: "nome que cada ocorrencia copia" },
      { name: "kind", type: "text", description: "common | meal | sleep | training" },
      { name: "status", type: "text", description: "status com que cada ocorrencia nasce; nulo = de referencia" },
      { name: "freq", type: "text", description: "daily | weekly | monthly | yearly" },
      { name: "interval_count", type: "integer", description: "a cada N periodos" },
      { name: "byweekday", type: "integer", description: "weekly: mascara de 7 bits, bit 0 = domingo" },
      { name: "bymonthday", type: "integer" },
      { name: "bymonth", type: "integer" },
      { name: "time_of_day", type: "text", description: "hora de inicio (HH:MM) no fuso da regra" },
      { name: "duration_minutes", type: "integer" },
      { name: "starts_on", type: "date" },
      { name: "ends_on", type: "date", description: "nulo se nao termina" },
    ],
    select: (userId) => sql`
      SELECT r.id, json_extract(r.template, '$.name') AS name, json_extract(r.template, '$.kind') AS kind,
             json_extract(r.template, '$.status') AS status, r.freq, r.interval_count, r.byweekday, r.bymonthday,
             r.bymonth, substr(r.time_of_day, 1, 5) AS time_of_day, r.duration_minutes, r.starts_on, r.ends_on
      FROM recurrences r
      WHERE r.user_id = ${userId}`,
  },
  {
    name: "artifacts",
    description:
      "Artefatos: objetos que guardam conteudo (uma nota de texto, um alimento, um sono, um treino, um exercicio). Podem estar soltos ou ligados a tarefas (task_artifacts); o conteudo fica em data, conforme type.",
    columns: [
      { name: "id", type: "text" },
      { name: "name", type: "text" },
      { name: "type", type: "text", description: "text | food | sleep | training | workout" },
      { name: "data", type: "json", description: ARTIFACT_DATA_DESCRIPTION },
      { name: "global", type: "boolean", description: "sem dono: alimento ou exercicio que todos leem" },
      { name: "derived", type: "boolean", description: "copia de um alimento, feita para a tarefa em que foi comido" },
      { name: "created_at", type: "timestamp" },
      { name: "updated_at", type: "timestamp" },
    ],
    select: (userId) => sql`
      SELECT a.id, a.name, a.type, a.data, a.user_id IS NULL AS global, a.derived, a.created_at, a.updated_at
      FROM artifacts a
      WHERE ${visibleArtifact(userId)}`,
  },
  {
    name: "artifact_tags",
    description: "Tags de cada artefato.",
    columns: [
      { name: "artifact_id", type: "text" },
      { name: "tag", type: "text" },
    ],
    select: (userId) => sql`
      SELECT att.artifact_id, g.name AS tag
      FROM artifact_tags att JOIN tags g ON g.id = att.tag_id JOIN artifacts a ON a.id = att.artifact_id
      WHERE ${visibleArtifact(userId)} AND g.user_id = ${userId}`,
  },
];

/** A lista de tabelas do escopo. A copia, o sandbox e a descricao do prompt saem desta mesma lista. */
export function logicalTables(): readonly LogicalTable[] {
  return TABLES;
}

const AFFINITY: Record<LogicalType, "TEXT" | "INTEGER"> = {
  text: "TEXT",
  integer: "INTEGER",
  boolean: "INTEGER",
  timestamp: "TEXT",
  date: "TEXT",
  json: "TEXT",
};

/** O `CREATE TABLE` da copia descartavel. */
export function createTableSql(table: LogicalTable): string {
  const columns = table.columns.map((column) => `${column.name} ${AFFINITY[column.type]}`).join(", ");
  return `CREATE TABLE ${table.name} (${columns})`;
}

export function describeLogicalSchema(): string {
  return TABLES.map((table) => {
    const columns = table.columns
      .map((column) => `  - ${column.name} ${column.type}${column.description ? ` — ${column.description}` : ""}`)
      .join("\n");
    return `${table.name}: ${table.description}\n${columns}`;
  }).join("\n\n");
}

/** O texto que explica o dialeto para o agente: SQLite, com data e hora em texto ISO. */
export const SQL_DIALECT_DESCRIPTION = [
  "Dialeto: SQLite 3 (so um SELECT, com WITH/CTEs, joins, subconsultas, janelas e UNION).",
  "Tipos das colunas: text; integer; boolean (INTEGER 0 ou 1: use `WHERE long_running`, `NOT global`);",
  "timestamp (TEXT ISO-8601 em UTC com milissegundos, ex.: '2026-09-15T12:00:00.000Z'; compara como texto e ordena no tempo);",
  "date (TEXT 'YYYY-MM-DD'); json (TEXT com JSON: json_extract(data, '$.a.b'), data->>'a', json_each).",
  "Fuso: os timestamps estao em UTC; America/Sao_Paulo e UTC-03:00 fixo, entao a hora local e datetime(started_at, '-3 hours'),",
  "o dia local e date(started_at, '-3 hours') (a coluna started_on ja traz) e a hora local e strftime('%H', started_at, '-3 hours').",
  "Datas e horas: date('now'), datetime('now'), strftime(formato, valor, modificadores...), julianday(valor), unixepoch(valor);",
  "modificadores como '-7 days', 'start of month', 'weekday 1'. Diferenca em dias: julianday(b) - julianday(a).",
  "Texto: lower, upper, length, substr, trim, replace, instr, printf, group_concat, concat; LIKE ignora caixa em ASCII; use '||' para concatenar.",
  "Agregacao: count, sum, total, avg, min, max, group_concat, json_group_array. Janelas: row_number, rank, dense_rank, lag, lead, ntile, first_value...",
  "Nao existem ::cast (use CAST(x AS integer)), ILIKE, interval, date_trunc, EXTRACT nem to_char.",
].join("\n");
