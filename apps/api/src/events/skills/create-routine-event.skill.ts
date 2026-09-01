import { z } from "zod";
import { baseSkillFields, defineEventSkill, toBaseEventInput } from "./event-skill";

const parameters = z.object({
  name: z
    .string()
    .min(1)
    .describe("Nome curto da atividade, ex: 'Reunião de planejamento', 'Estudar inglês'."),
  ...baseSkillFields,
});

export const createRoutineEventSkill = defineEventSkill({
  name: "create_routine_event",
  description:
    "Registra qualquer outra atividade da rotina que não seja treino, alimentação ou sono: trabalho, estudo, reuniões, lazer, deslocamento.",
  instructions: [
    "create_routine_event — é o fallback. Use quando a atividade não for treino,",
    "alimentação ou sono. name deve ser curto e descritivo, com inicial maiúscula.",
    "Detalhes adicionais vão em description, não no name.",
  ].join("\n"),
  parameters,
  toCreateEventInput: (args) => ({
    name: args.name,
    items: [{ type: "routine" }],
    ...toBaseEventInput(args),
  }),
});
