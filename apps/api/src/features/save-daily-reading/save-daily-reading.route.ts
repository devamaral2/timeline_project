import type { DailyReadingResult } from "@repo/contracts";
import { dailyReadingInputSchema } from "@repo/contracts/schemas";
import { z } from "zod";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import type { SaveDailyReadingUseCase } from "./save-daily-reading.usecase";

export const saveDailyReadingOperation = {
  method: "POST",
  path: "/api/tasks/daily-reading",
  status: 200,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/**
 * `POST /api/tasks/daily-reading`: guarda uma pagina lida, ja em markdown, na
 * tarefa "Leitura diaria" do dia. Quem manda e a extensao do navegador
 * (`apps/extension`).
 */
export function saveDailyReadingRoute(
  saveDailyReading: Pick<SaveDailyReadingUseCase, "execute">,
): ApiRoute {
  return {
    ...saveDailyReadingOperation,
    handler: ({ body, actor }): Promise<DailyReadingResult> => {
      const parsed = dailyReadingInputSchema.safeParse(body);
      if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
      return saveDailyReading.execute(parsed.data, actor);
    },
  };
}
