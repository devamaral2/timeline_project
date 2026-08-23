import { z } from "zod";
import { baseSkillFields, defineEventSkill, toBaseEventInput } from "./event-skill";

const parameters = z.object({
  trackedSleepTime: z.number().nonnegative().describe("Tempo dormido em MINUTOS."),
  score: z
    .number()
    .min(0)
    .max(100)
    .describe("Nota de qualidade do sono, de 0 a 100. Use 0 se o usuário não informou."),
  ...baseSkillFields,
});

export const createSleepEventSkill = defineEventSkill({
  name: "create_sleep_event",
  description: "Registra uma noite de sono ou um cochilo.",
  instructions: [
    "create_sleep_event — trackedSleepTime SEMPRE em minutos:",
    "'dormi 7 horas e meia' = 450, 'cochilei 20 minutos' = 20.",
    "score é a nota de qualidade de 0 a 100; se o usuário não deu nota, use 0.",
  ].join("\n"),
  parameters,
  toCreateEventInput: (args) => ({
    type: "sleep",
    data: { trackedSleepTime: args.trackedSleepTime, score: args.score },
    ...toBaseEventInput(args),
  }),
});
