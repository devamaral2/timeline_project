/**
 * As tabelas que a query do agente enxerga. E a fonte unica de duas coisas que
 * precisam bater: os CTEs que substituem as tabelas reais (ja filtrados pelo
 * usuario e sem linhas apagadas) e a descricao que vai para o prompt.
 *
 * `$1` e o id do usuario. Toda tabela filha junta com o pai para herdar o
 * filtro, porque ela nao tem `user_id` proprio.
 */
interface LogicalColumn {
  name: string;
  expr: string;
  type: string;
  description?: string;
}

interface LogicalTable {
  name: string;
  description: string;
  from: string;
  where: string;
  columns: LogicalColumn[];
}

const ITEM_DATA_DESCRIPTION = [
  "formato depende de type:",
  "routine → {};",
  "sleep → {trackedSleepTime: minutos, score: 0-100};",
  "meal → {name, description, totals: {totalCaloriesKcal, totalProteinGrams, totalCarbohydrateGrams, totalFatGrams, totalFiberGrams},",
  "foodItems: [{name, portion, approximateWeightGrams, caloriesKcal, macronutrients: {carbohydratesGrams, proteinsGrams, totalFatGrams, fiberGrams}, micronutrients: {nome: valor}}]};",
  "training → {caloriesBurned, workouts: [{workoutCode: running|treadmill|weightlifting|free, workoutName, calories, duration: minutos,",
  "pace?: min/km, distance?: km, sets?: [{exercise, repetitions, weight: kg}]}]}",
].join(" ");

export const LOGICAL_TABLES: readonly LogicalTable[] = [
  {
    name: "events",
    description: "Eventos da timeline (passado, agora ou futuro; podem se sobrepor).",
    from: "public.events e",
    where: "e.user_id = $1 AND e.deleted_at IS NULL",
    columns: [
      { name: "id", expr: "e.id", type: "text" },
      { name: "name", expr: "e.name", type: "text" },
      { name: "description", expr: "e.description", type: "text" },
      { name: "started_at", expr: "e.started_at", type: "timestamptz" },
      { name: "finished_at", expr: "e.finished_at", type: "timestamptz", description: "nulo se sem fim registrado" },
      { name: "started_on", expr: "e.started_on", type: "date", description: "dia de started_at em America/Sao_Paulo" },
      { name: "missed", expr: "e.missed", type: "boolean", description: "o usuario marcou como nao realizado" },
      { name: "priority", expr: "e.priority::text", type: "text", description: "urgent | normal | flexible" },
      { name: "recurrence_id", expr: "e.recurrence_id", type: "text", description: "serie de origem, se for ocorrencia" },
      { name: "occurrence_on", expr: "e.occurrence_on", type: "date" },
      { name: "created_at", expr: "e.created_at", type: "timestamptz" },
      { name: "updated_at", expr: "e.updated_at", type: "timestamptz" },
    ],
  },
  {
    name: "event_items",
    description: "O que o evento registra. Um evento tem um item principal (is_primary).",
    from: "public.event_items i JOIN public.events e ON e.id = i.event_id",
    where: "e.user_id = $1 AND e.deleted_at IS NULL",
    columns: [
      { name: "id", expr: "i.id", type: "text" },
      { name: "event_id", expr: "i.event_id", type: "text" },
      { name: "position", expr: "i.position", type: "integer" },
      { name: "type", expr: "i.type", type: "text", description: "routine | meal | sleep | training" },
      { name: "is_primary", expr: "i.is_primary", type: "boolean" },
      { name: "data", expr: "i.data", type: "jsonb", description: ITEM_DATA_DESCRIPTION },
    ],
  },
  {
    name: "event_interruptions",
    description: "Pausas dentro de um evento.",
    from: "public.event_interruptions x JOIN public.events e ON e.id = x.event_id",
    where: "e.user_id = $1 AND e.deleted_at IS NULL",
    columns: [
      { name: "id", expr: "x.id", type: "text" },
      { name: "event_id", expr: "x.event_id", type: "text" },
      { name: "name", expr: "x.name", type: "text" },
      { name: "description", expr: "x.description", type: "text" },
      { name: "started_at", expr: "x.started_at", type: "timestamptz" },
      { name: "finished_at", expr: "x.finished_at", type: "timestamptz" },
    ],
  },
  {
    name: "event_tags",
    description: "Tags de cada evento.",
    from: "public.event_tags et JOIN public.tags t ON t.id = et.tag_id JOIN public.events e ON e.id = et.event_id",
    where: "e.user_id = $1 AND e.deleted_at IS NULL",
    columns: [
      { name: "event_id", expr: "et.event_id", type: "text" },
      { name: "tag", expr: "t.name", type: "text" },
    ],
  },
  {
    name: "tasks",
    description: "Tarefas. Subtarefa e uma tarefa com parent_task_id.",
    from: "public.tasks t",
    where: "t.user_id = $1 AND t.deleted_at IS NULL",
    columns: [
      { name: "id", expr: "t.id", type: "text" },
      { name: "parent_task_id", expr: "t.parent_task_id", type: "text" },
      { name: "name", expr: "t.name", type: "text" },
      { name: "description", expr: "t.description", type: "text" },
      { name: "status", expr: "t.status::text", type: "text", description: "inHold | todo | inProgress | done | cancel" },
      { name: "priority", expr: "t.priority::text", type: "text", description: "urgent | high | medium | low" },
      { name: "started_at", expr: "t.started_at", type: "timestamptz" },
      { name: "estimated_finish_at", expr: "t.estimated_finish_at", type: "timestamptz" },
      { name: "finished_at", expr: "t.finished_at", type: "timestamptz" },
      { name: "recurrence_id", expr: "t.recurrence_id", type: "text" },
      { name: "occurrence_on", expr: "t.occurrence_on", type: "date" },
      { name: "created_at", expr: "t.created_at", type: "timestamptz" },
      { name: "updated_at", expr: "t.updated_at", type: "timestamptz" },
    ],
  },
  {
    name: "task_tags",
    description: "Tags de cada tarefa.",
    from: "public.task_tags tt JOIN public.tags g ON g.id = tt.tag_id JOIN public.tasks t ON t.id = tt.task_id",
    where: "t.user_id = $1 AND t.deleted_at IS NULL",
    columns: [
      { name: "task_id", expr: "tt.task_id", type: "text" },
      { name: "tag", expr: "g.name", type: "text" },
    ],
  },
  {
    name: "task_dependencies",
    description: "task_id so pode comecar depois de depends_on_task_id.",
    from:
      "public.task_dependencies d JOIN public.tasks t ON t.id = d.task_id JOIN public.tasks p ON p.id = d.depends_on_task_id",
    where: "t.user_id = $1 AND t.deleted_at IS NULL AND p.user_id = $1 AND p.deleted_at IS NULL",
    columns: [
      { name: "task_id", expr: "d.task_id", type: "text" },
      { name: "depends_on_task_id", expr: "d.depends_on_task_id", type: "text" },
    ],
  },
  {
    name: "event_tasks",
    description: "Tarefas ligadas a um evento.",
    from: "public.event_tasks l JOIN public.events e ON e.id = l.event_id JOIN public.tasks t ON t.id = l.task_id",
    where: "e.user_id = $1 AND e.deleted_at IS NULL AND t.user_id = $1 AND t.deleted_at IS NULL",
    columns: [
      { name: "event_id", expr: "l.event_id", type: "text" },
      { name: "task_id", expr: "l.task_id", type: "text" },
    ],
  },
  {
    name: "notes",
    description: "Notas livres, soltas ou presas a um evento ou a uma tarefa.",
    from: "public.notes n",
    where: "n.user_id = $1 AND n.deleted_at IS NULL",
    columns: [
      { name: "id", expr: "n.id", type: "text" },
      { name: "content", expr: "n.content", type: "text" },
      { name: "event_id", expr: "n.event_id", type: "text" },
      { name: "task_id", expr: "n.task_id", type: "text" },
      { name: "created_at", expr: "n.created_at", type: "timestamptz" },
      { name: "updated_at", expr: "n.updated_at", type: "timestamptz" },
    ],
  },
];

export const LOGICAL_TABLE_NAMES: ReadonlySet<string> = new Set(LOGICAL_TABLES.map((table) => table.name));

/**
 * `MATERIALIZED` impede o Postgres de embutir o CTE e misturar o predicado da
 * query do agente com o filtro de usuario — a ordem entre os dois passaria a
 * depender de custo estimado, e um `name::int = 1` avaliado antes do filtro
 * devolveria no erro o valor de outro usuario.
 */
export function buildShadowCtes(): string {
  return LOGICAL_TABLES.map((table) => {
    const columns = table.columns.map((column) => `${column.expr} AS ${column.name}`).join(", ");
    return `${table.name} AS MATERIALIZED (SELECT ${columns} FROM ${table.from} WHERE ${table.where})`;
  }).join(",\n");
}

export function describeLogicalSchema(): string {
  return LOGICAL_TABLES.map((table) => {
    const columns = table.columns
      .map((column) => `  - ${column.name} ${column.type}${column.description ? ` — ${column.description}` : ""}`)
      .join("\n");
    return `${table.name}: ${table.description}\n${columns}`;
  }).join("\n\n");
}
