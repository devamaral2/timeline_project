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

/** O que decide o projeto de uma tarefa que nasce. Cada regra nova da resolucao entra aqui como um campo. */
export interface ProjectResolutionInput {
  userId: string;
  /**
   * Regra 1: o projeto que veio na entrada, que precisa ser do usuario (`ProjectNotFoundError` se nao existe ou e de
   * outro). `null` pede o `personal` de proposito, e vale mesmo para a ocorrencia de uma serie de outro projeto.
   */
  projectId?: string | null;
  /** A serie de que a tarefa e uma ocorrencia: ela fica no projeto da serie. */
  recurrenceId?: string | null;
}

/**
 * O projeto de uma tarefa (ou serie) que esta sendo criada. E por aqui que passa toda gravacao que cria tarefa:
 * criacao pela pessoa, pedido, passo, calculo de alimento, tarefa por voz, ocorrencia e lote do agente. A primeira
 * regra que se aplica vale: o `projectId` da entrada, depois a ocorrencia no projeto da serie e todo o resto em
 * `personal`.
 */
export async function resolveProjectId(tx: Tx, input: ProjectResolutionInput): Promise<string> {
  if (input.projectId === null) return ensurePersonalProject(tx, input.userId);
  if (input.projectId !== undefined) return assertProjectOf(tx, input.userId, input.projectId);
  if (input.recurrenceId) {
    const [series] = await tx
      .select({ projectId: schema.recurrences.projectId })
      .from(schema.recurrences)
      .where(eq(schema.recurrences.id, input.recurrenceId));
    if (series) return series.projectId;
  }
  return ensurePersonalProject(tx, input.userId);
}

/** O projeto escolhido na entrada: ele existe e e do usuario, ou nada. Quem pede nao descobre qual dos dois falhou. */
async function assertProjectOf(tx: Tx, userId: string, projectId: string): Promise<string> {
  const [found] = await tx
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)));
  if (!found) throw new ProjectNotFoundError(`Project not found: ${projectId}`);
  return found.id;
}
