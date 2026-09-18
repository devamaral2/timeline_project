import { z } from "zod";
import type { SleepItem } from "@repo/entities";
import { defineAgentSkill, fail } from "./agent-skill";
import { eventBaseFields, primaryItemOf, toBaseChanges, toCreateEventInput, withPrimaryData } from "./event-skill-fields";

export const sleepEventSkill = defineAgentSkill({
  name: "save_sleep_event",
  progressLabel: "Preparando sono",
  description: "Cria ou altera uma noite de sono ou um cochilo.",
  instructions: [
    "save_sleep_event — trackedSleepTime SEMPRE em minutos: 'dormi 7 horas e meia' = 450.",
    "score é a nota de 0 a 100; na criação, 0 se o usuário não deu nota.",
    "Com id, os valores enviados SUBSTITUEM os atuais. Se o usuário corrige quanto dormiu",
    "('dormi só 4 horas esta noite'), consulte o sono da noite e altere-o em vez de criar outro.",
  ].join("\n"),
  parameters: z.object({
    ...eventBaseFields,
    trackedSleepTime: z
      .number()
      .nonnegative()
      .optional()
      .describe("Tempo dormido em MINUTOS. Obrigatório na criação."),
    score: z.number().min(0).max(100).optional().describe("Nota de qualidade do sono, de 0 a 100."),
  }),
  run: async (args, { session }) => {
    if (!args.id) {
      if (args.trackedSleepTime === undefined) return fail("trackedSleepTime é obrigatório para criar um sono.");
      return session.createEvent(
        toCreateEventInput(args, {
          type: "sleep",
          data: { trackedSleepTime: args.trackedSleepTime, score: args.score ?? 0 },
        }),
      );
    }

    return session.updateEvent(args.id, "sleep", async (current) => {
      const existing = primaryItemOf(current).data as SleepItem;
      const data: SleepItem = {
        trackedSleepTime: args.trackedSleepTime ?? existing.trackedSleepTime,
        score: args.score ?? existing.score,
      };
      return current.revise({ ...toBaseChanges(args), items: withPrimaryData(current, data) });
    });
  },
});
