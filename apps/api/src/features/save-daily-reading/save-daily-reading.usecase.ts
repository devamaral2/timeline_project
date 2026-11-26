import type { DailyReadingInput, DailyReadingResult } from "@repo/contracts";
import { TaskValidationError } from "../../domain";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { composeReadingArticle } from "./daily-reading-article";
import type { DailyReadingGate } from "./daily-reading.gate";

/**
 * Guarda uma página lida na tarefa "Leitura diária" do dia, pela porta da
 * leitura (`DailyReadingGate`): a regra de achar ou criar a leitura, ligar o
 * artefato e devolvê-la para a fazer mora lá. Guardar de novo a mesma página no
 * mesmo dia atualiza o artefato dela, não cria outro.
 */
export class SaveDailyReadingUseCase {
  constructor(private readonly gate: Pick<DailyReadingGate, "place">) {}

  async execute(input: DailyReadingInput, actor: AuthenticatedUser): Promise<DailyReadingResult> {
    const article = composeReadingArticle(input);
    if (!article) throw new TaskValidationError("Invalid url");

    const placed = await this.gate.place({ actor, article });
    return {
      taskId: placed.readingTaskId,
      artifactId: placed.artifactId,
      taskCreated: placed.readingCreated,
      artifactCreated: placed.artifactCreated,
    };
  }
}
