/**
 * As tabelas que a query do agente enxerga. E a fonte unica de duas coisas que
 * precisam bater: os CTEs que substituem as tabelas reais (ja filtrados pelo
 * usuario e sem linhas apagadas) e a descricao que vai para o prompt.
 *
 * `$1` e o id do usuario. Toda tabela filha junta com o pai para herdar o
 * filtro, porque ela nao tem `user_id` proprio.
 *
 * So entram as tarefas de pessoa e os artefatos: os pedidos ao agente, os
 * passos e as entradas deles ficam de fora. As relacoes aparecem como visoes
 * com nome (`task_subtasks`, `task_artifacts`), e nao como o
 * grafo de relacoes.
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

const ARTIFACT_DATA_DESCRIPTION = [
  "formato depende de type:",
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
const VISIBLE_ARTIFACT = "a.deleted_at IS NULL AND (a.user_id = $1 OR a.user_id IS NULL) AND a.type IN ('text', 'food', 'sleep', 'training', 'workout')";
const VISIBLE_TASK = (alias: string) => `${alias}.user_id = $1 AND ${alias}.actor = 'human' AND ${alias}.deleted_at IS NULL`;

const TABLES: readonly LogicalTable[] = [
  {
    name: "tasks",
    description:
      "Tarefas do usuario (passado, agora ou futuro; podem se sobrepor). Com status, a tarefa e acompanhada na lista de tarefas; sem status, e tarefa de referencia e so marca um horario na agenda.",
    from: "public.tasks e JOIN public.projects pr ON pr.id = e.project_id",
    where: VISIBLE_TASK("e"),
    columns: [
      { name: "id", expr: "e.id", type: "text" },
      { name: "name", expr: "e.name", type: "text" },
      {
        name: "project", expr: "pr.name", type: "text",
        description: "nome do projeto da tarefa; `diario` quando nenhum foi escolhido",
      },
      { name: "description", expr: "e.description", type: "text" },
      { name: "location", expr: "e.location", type: "text", description: "onde a tarefa acontece; nulo se ninguem informou" },
      { name: "kind", expr: "e.kind", type: "text", description: "default | meal | sleep | training" },
      {
        name: "status", expr: "e.status", type: "text",
        description: "nulo = tarefa de referencia, que so marca um horario; senao todo | toDefine | doing | inHold | done | cancel | missed (nao realizado)",
      },
      { name: "priority", expr: "e.priority", type: "text", description: "urgent | high | medium | low" },
      { name: "started_at", expr: "e.started_at", type: "timestamptz", description: "inicio planejado; nulo se nao tem" },
      {
        name: "started_on", expr: "(e.started_at AT TIME ZONE 'America/Sao_Paulo')::date", type: "date",
        description: "dia de started_at em America/Sao_Paulo",
      },
      {
        name: "estimated_finish_at", expr: "e.estimated_finish_at", type: "timestamptz",
        description: "fim planejado: o fim do bloco na agenda ou, na tarefa longa, o prazo",
      },
      { name: "finished_at", expr: "e.finished_at", type: "timestamptz", description: "conclusao real; nulo se nao terminou" },
      {
        name: "long_running", expr: "e.long_running", type: "boolean",
        description: "tarefa longa: fica fora da agenda e sempre tem status",
      },
      { name: "recurrence_id", expr: "e.recurrence_id", type: "text", description: "serie de origem, se for ocorrencia" },
      { name: "occurrence_on", expr: "e.occurrence_on", type: "date" },
      { name: "created_at", expr: "e.created_at", type: "timestamptz" },
      { name: "updated_at", expr: "e.updated_at", type: "timestamptz" },
    ],
  },
  {
    name: "task_subtasks",
    description: "Hierarquia entre tarefas: subtask_id e subtarefa de parent_task_id (a tarefa principal). Cada tarefa tem no maximo uma principal e pode ter varias subtarefas.",
    from: "public.task_task_relation r JOIN public.tasks p ON p.id = r.from_task_id JOIN public.tasks c ON c.id = r.to_task_id",
    where: `r.relation = 'subtask' AND ${VISIBLE_TASK("p")} AND ${VISIBLE_TASK("c")}`,
    columns: [
      { name: "parent_task_id", expr: "r.from_task_id", type: "text" },
      { name: "subtask_id", expr: "r.to_task_id", type: "text" },
    ],
  },
  {
    name: "task_artifacts",
    description: "Artefatos de uma tarefa, na ordem em que aparecem (position). Um artefato pode estar em varias tarefas.",
    from: "public.task_artifact_relation l JOIN public.tasks e ON e.id = l.task_id JOIN public.artifacts a ON a.id = l.artifact_id",
    where: `${VISIBLE_TASK("e")} AND ${VISIBLE_ARTIFACT}`,
    columns: [
      { name: "task_id", expr: "l.task_id", type: "text" },
      { name: "artifact_id", expr: "l.artifact_id", type: "text" },
      { name: "relation", expr: "l.relation", type: "text", description: "o que a tarefa fez com o artefato: creates | updates | uses | deletes" },
      { name: "position", expr: "l.position", type: "integer" },
    ],
  },
  {
    name: "task_tags",
    description: "Tags de cada tarefa.",
    from: "public.task_tags et JOIN public.tags t ON t.id = et.tag_id JOIN public.tasks e ON e.id = et.task_id",
    where: `${VISIBLE_TASK("e")} AND t.user_id = $1`,
    columns: [
      { name: "task_id", expr: "et.task_id", type: "text" },
      { name: "tag", expr: "t.name", type: "text" },
    ],
  },
  {
    name: "recurrences",
    description:
      "Series recorrentes. Cada ocorrencia e uma linha em tasks com recurrence_id apontando para ca; so as dos proximos dias ja foram geradas.",
    from: "public.recurrences r",
    where: "r.user_id = $1",
    columns: [
      { name: "id", expr: "r.id", type: "text" },
      { name: "name", expr: "r.template->>'name'", type: "text", description: "nome que cada ocorrencia copia" },
      { name: "kind", expr: "r.template->>'kind'", type: "text", description: "default | meal | sleep | training" },
      { name: "status", expr: "r.template->>'status'", type: "text", description: "status com que cada ocorrencia nasce; nulo = de referencia" },
      { name: "freq", expr: "r.freq", type: "text", description: "daily | weekly | monthly | yearly" },
      { name: "interval_count", expr: "r.interval_count", type: "integer", description: "a cada N periodos" },
      { name: "byweekday", expr: "r.byweekday", type: "integer", description: "weekly: mascara de 7 bits, bit 0 = domingo" },
      { name: "bymonthday", expr: "r.bymonthday", type: "integer" },
      { name: "bymonth", expr: "r.bymonth", type: "integer" },
      { name: "time_of_day", expr: "to_char(r.time_of_day, 'HH24:MI')", type: "text", description: "hora de inicio no fuso da regra" },
      { name: "duration_minutes", expr: "r.duration_minutes", type: "integer" },
      { name: "starts_on", expr: "r.starts_on", type: "date" },
      { name: "ends_on", expr: "r.ends_on", type: "date", description: "nulo se nao termina" },
    ],
  },
  {
    name: "artifacts",
    description:
      "Artefatos: objetos que guardam conteudo (uma nota de texto, um alimento, um sono, um treino, um exercicio). Podem estar soltos ou ligados a tarefas (task_artifacts); o conteudo fica em data, conforme type.",
    from: "public.artifacts a",
    where: VISIBLE_ARTIFACT,
    columns: [
      { name: "id", expr: "a.id", type: "text" },
      { name: "name", expr: "a.name", type: "text" },
      { name: "type", expr: "a.type", type: "text", description: "text | food | sleep | training | workout" },
      { name: "data", expr: "a.data", type: "jsonb", description: ARTIFACT_DATA_DESCRIPTION },
      { name: "global", expr: "a.user_id IS NULL", type: "boolean", description: "sem dono: alimento ou exercicio que todos leem" },
      { name: "derived", expr: "a.derived", type: "boolean", description: "copia de um alimento, feita para a tarefa em que foi comido" },
      { name: "created_at", expr: "a.created_at", type: "timestamptz" },
      { name: "updated_at", expr: "a.updated_at", type: "timestamptz" },
    ],
  },
  {
    name: "artifact_tags",
    description: "Tags de cada artefato.",
    from: "public.artifact_tags at JOIN public.tags g ON g.id = at.tag_id JOIN public.artifacts a ON a.id = at.artifact_id",
    where: `${VISIBLE_ARTIFACT} AND g.user_id = $1`,
    columns: [
      { name: "artifact_id", expr: "at.artifact_id", type: "text" },
      { name: "tag", expr: "g.name", type: "text" },
    ],
  },
];

/**
 * A lista de tabelas do escopo. As quatro leituras (CTEs, validador, descricao
 * do prompt e a conferencia de forma do rewrite) saem desta mesma lista, para
 * que nenhuma delas divirja.
 */
export function logicalTables(): readonly LogicalTable[] {
  return TABLES;
}

const TABLE_NAMES: ReadonlySet<string> = new Set(TABLES.map((table) => table.name));

export function logicalTableNames(): ReadonlySet<string> {
  return TABLE_NAMES;
}

/**
 * `MATERIALIZED` impede o Postgres de embutir o CTE e misturar o predicado da
 * query do agente com o filtro de usuario — a ordem entre os dois passaria a
 * depender de custo estimado, e um `name::int = 1` avaliado antes do filtro
 * devolveria no erro o valor de outro usuario.
 *
 * Um CTE que a query nao referencia nao e executado: as tabelas que sobram nao
 * custam nada alem do texto.
 */
export function buildShadowCtes(): string {
  return TABLES
    .map((table) => {
      const columns = table.columns.map((column) => `${column.expr} AS ${column.name}`).join(", ");
      return `${table.name} AS MATERIALIZED (SELECT ${columns} FROM ${table.from} WHERE ${table.where})`;
    })
    .join(",\n");
}

export function describeLogicalSchema(): string {
  return TABLES
    .map((table) => {
      const columns = table.columns
        .map((column) => `  - ${column.name} ${column.type}${column.description ? ` — ${column.description}` : ""}`)
        .join("\n");
      return `${table.name}: ${table.description}\n${columns}`;
    })
    .join("\n\n");
}
