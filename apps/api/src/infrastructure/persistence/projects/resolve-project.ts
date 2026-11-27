import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { ProjectNotFoundError } from "../../../domain";
import * as schema from "../database/schema";
import { lockUser, type Tx } from "../shared/tx";

/**
 * O projeto `personal` do usuario, criado na primeira necessidade. A leitura sem trava resolve quase sempre; so
 * quem nao achou o projeto pega a trava por usuario e confere de novo, para que duas gravacoes ao mesmo tempo
 * criem um so.
 */
export async function ensurePersonalProject(tx: Tx, userId: string): Promise<string> {
  const find = async () => {
    const [found] = await tx
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.userId, userId), eq(schema.projects.personal, true)));
    return found?.id;
  };

  const existing = await find();
  if (existing) return existing;

  await lockUser(tx, userId);
  const again = await find();
  if (again) return again;

  const id = ulid();
  await tx.insert(schema.projects).values({ id, userId, name: schema.PERSONAL_PROJECT_NAME, personal: true });
  return id;
}

/**
 * O que decide o projeto de uma tarefa que nasce. Cada campo e uma regra da resolucao, na ordem em que valem:
 * `projectId`, `requestId`, `sessionId`, `targetTaskId`, `recurrenceId` e, por fim, `personal`.
 */
export interface ProjectResolutionInput {
  userId: string;
  /**
   * 1. O projeto que veio na entrada: precisa ser do usuario, senao `ProjectNotFoundError`. `null` pede o `personal`
   * de proposito e vale ate para a ocorrencia de uma serie de outro projeto (a edicao que devolve a tarefa a `personal`).
   */
  projectId?: string | null;
  /** 2 e 3. O pedido de que a tarefa e passo, ou que a cria pela rota por passos: ela fica no projeto dele. */
  requestId?: string;
  /** 4. O primeiro pedido da sessao que o pedido continua: fica no projeto dele. */
  sessionId?: string;
  /** 5. A tarefa sobre a qual o pedido de edicao foi feito: fica no projeto dela. */
  targetTaskId?: string;
  /** 6. A serie de que a tarefa e uma ocorrencia: ela fica no projeto da serie. */
  recurrenceId?: string | null;
}

/** As regras que um chamador conhece alem do usuario: o que `resolveProjectId` recebe sem o `userId`. */
export type ProjectScope = Omit<ProjectResolutionInput, "userId">;

/** O projeto de uma tarefa do usuario, ou nada quando ela nao existe ou e de outro. */
async function projectOfTask(tx: Tx, userId: string, taskId: string): Promise<string | undefined> {
  const [found] = await tx
    .select({ projectId: schema.tasks.projectId })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.userId, userId)));
  return found?.projectId;
}

/**
 * O projeto de uma tarefa (ou serie) que esta sendo criada. E por aqui que passa toda gravacao que cria tarefa:
 * criacao pela pessoa, pedido, passo, calculo de alimento, tarefa por voz, ocorrencia e lote do agente. A primeira
 * regra que se aplica vale; as que nao acham o que procuram (o pedido sumiu, a tarefa alvo foi apagada) passam
 * adiante, e o que sobra cai em `personal`.
 */
export async function resolveProjectId(tx: Tx, input: ProjectResolutionInput): Promise<string> {
  if (input.projectId === null) return ensurePersonalProject(tx, input.userId);
  if (input.projectId) {
    const [owned] = await tx
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, input.projectId), eq(schema.projects.userId, input.userId)));
    if (!owned) throw new ProjectNotFoundError();
    return owned.id;
  }
  for (const taskId of [input.requestId, input.sessionId, input.targetTaskId]) {
    const projectId = taskId ? await projectOfTask(tx, input.userId, taskId) : undefined;
    if (projectId) return projectId;
  }
  if (input.recurrenceId) {
    const [series] = await tx
      .select({ projectId: schema.recurrences.projectId })
      .from(schema.recurrences)
      .where(eq(schema.recurrences.id, input.recurrenceId));
    if (series) return series.projectId;
  }
  return ensurePersonalProject(tx, input.userId);
}

