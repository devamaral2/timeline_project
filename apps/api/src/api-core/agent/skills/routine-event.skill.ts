import { z } from "zod";
import { skillText } from "../config/agent-config";
import { defineAgentSkill, fail } from "./agent-skill";
import { eventBaseFields, toBaseChanges, toCreateEventInput } from "./event-skill-fields";

export const routineEventSkill = defineAgentSkill({
  name: "save_routine_event",
  ...skillText("save_routine_event"),
  parameters: z.object(eventBaseFields),
  run: async (args, { session }) => {
    if (!args.id) {
      if (!args.name) return fail("name é obrigatório para criar um evento de rotina.");
      return session.createEvent(toCreateEventInput(args, "routine"));
    }
    return session.updateEvent(args.id, "routine", async (current) => current.revise(toBaseChanges(args)));
  },
});
