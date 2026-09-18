import { z } from "zod";
import { defineAgentSkill, fail } from "./agent-skill";
import { eventBaseFields, toBaseChanges, toCreateEventInput } from "./event-skill-fields";

export const routineEventSkill = defineAgentSkill({
  name: "save_routine_event",
  progressLabel: "Preparando rotina",
  description:
    "Cria ou altera qualquer atividade que não seja treino, refeição ou sono: trabalho, estudo, reunião, lazer, deslocamento.",
  instructions: [
    "save_routine_event — o fallback para eventos. name é obrigatório na criação, curto e com",
    "inicial maiúscula; detalhes vão em description.",
  ].join("\n"),
  parameters: z.object(eventBaseFields),
  run: async (args, { session }) => {
    if (!args.id) {
      if (!args.name) return fail("name é obrigatório para criar um evento de rotina.");
      return session.createEvent(toCreateEventInput(args, { type: "routine" }));
    }
    return session.updateEvent(args.id, "routine", async (current) => current.revise(toBaseChanges(args)));
  },
});
