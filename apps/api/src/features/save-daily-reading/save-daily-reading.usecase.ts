import type { DailyReadingInput, DailyReadingResult } from "@repo/contracts";
import type { TaskRelations } from "../../api-core/tasks/task-relations";
import { Task, TaskValidationError } from "../../domain";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { composeReadingArticle } from "../../api-core/tasks/daily-reading-article";
import type { DailyReadingGate } from "../../api-core/tasks/daily-reading.gate";

/**
 * Guarda uma página lida na tarefa "Leitura diária" do dia, pela porta da
 * leitura (`DailyReadingGate`): a regra de achar ou criar a leitura, ligar o
 * artefato e devolvê-la para a fazer mora lá. Guardar de novo a mesma página no
 * mesmo dia atualiza o artefato dela, não cria outro.
 *
 * Cada gravação registra a tarefa de agente `save_content` (spec #39), que nasce
 * e termina `done` na mesma gravação: ela cria ou atualiza o artefato e gera ou
 * altera a leitura.
 */
export class SaveDailyReadingUseCase {
  constructor(
    private readonly gate: Pick<DailyReadingGate, "place" | "now">,
    private readonly relations: TaskRelations,
  ) {}

  async execute(input: DailyReadingInput, actor: AuthenticatedUser): Promise<DailyReadingResult> {
    const article = composeReadingArticle(input);
    if (!article) throw new TaskValidationError("Invalid url");

    const placed = await this.gate.place({
      actor,
      article,
      companion: (where) => {
        const now = this.gate.now();
        const saved = Task.create({
          userId: actor.userId,
          actor: "agent",
          kind: "save_content",
          status: "done",
          name: `Página guardada: ${article.name}`,
          startedAt: now,
          finishedAt: now,
          data: { url: article.sourceUrl },
          artifactLinks: [{ artifactId: where.artifactId, relation: where.artifactRelation(), fromRecurrence: false }],
        });
        return {
          tasks: [{ op: "create", entity: saved }],
          afterWrite: (tx) =>
            this.relations.record(tx, {
              fromTaskId: saved.id,
              toTaskId: where.readingTaskId,
              relation: where.readingRelation(),
            }),
        };
      },
    });
    return {
      taskId: placed.readingTaskId,
      artifactId: placed.artifactId,
      taskCreated: placed.readingCreated,
      artifactCreated: placed.artifactCreated,
    };
  }
}
