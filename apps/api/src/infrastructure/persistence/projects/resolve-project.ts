import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
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
  /** A serie de que a tarefa e uma ocorrencia: ela fica no projeto da serie. */
  recurrenceId?: string | null;
}

/**
 * O projeto de uma tarefa (ou serie) que esta sendo criada. E por aqui que passa toda gravacao que cria tarefa:
 * criacao pela pessoa, pedido, passo, calculo de alimento, tarefa por voz, ocorrencia e lote do agente. A primeira
 * regra que se aplica vale; nesta versao sao duas: a ocorrencia fica no projeto da serie e todo o resto, em `personal`.
 */
export async function resolveProjectId(tx: Tx, input: ProjectResolutionInput): Promise<string> {
  if (input.recurrenceId) {
    const [series] = await tx
      .select({ projectId: schema.recurrences.projectId })
      .from(schema.recurrences)
      .where(eq(schema.recurrences.id, input.recurrenceId));
    if (series) return series.projectId;
  }
  return ensurePersonalProject(tx, input.userId);
}
