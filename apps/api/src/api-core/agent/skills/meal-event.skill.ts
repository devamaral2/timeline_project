import { z } from "zod";
import type { MealItem } from "../../../domain";
import { skillText } from "../config/agent-config";
import { defineAgentSkill, fail } from "./agent-skill";
import { eventBaseFields, toBaseChanges, toCreateEventInput } from "./event-skill-fields";

export const mealEventSkill = defineAgentSkill({
  name: "save_meal_event",
  ...skillText("save_meal_event"),
  parameters: z.object({
    ...eventBaseFields,
    inputText: z
      .string()
      .min(1)
      .optional()
      .describe("Alimentos e quantidades. Obrigatório na criação; numa alteração, o que acrescentar."),
  }),
  run: async (args, { session }) => {
    if (!args.id) {
      if (!args.inputText) return fail("inputText é obrigatório para criar uma refeição.");
      return session.createEvent(
        toCreateEventInput(args, "meal", { type: "meal", data: { inputText: args.inputText } }),
      );
    }

    const inputText = args.inputText;
    return session.updateEvent(args.id, "meal", async (current) => {
      const existing = await session.noteOfType(current, "meal");
      if (!inputText && existing) return current.revise(toBaseChanges(args));
      const baseChanges = toBaseChanges(args);
      // Only user-owned prose is carried forward, never the previous nutrition snapshot.
      // Replacing the link also permits quick additions while the old note is pending.
      const description = [existing ? (existing.data as MealItem).description : "", inputText]
        .filter(Boolean).join("; ") || (baseChanges.description ?? current.description).trim()
          || baseChanges.name || current.name;
      const replacement = await session.buildNote(
        { type: "meal", data: { inputText: description } },
        baseChanges.startedAt ?? current.startedAt,
      );
      const revised = current.revise({
        ...baseChanges,
        noteLinks: existing
          ? current.noteLinks.map((link) => link.noteId === existing.id
            ? { noteId: replacement.id, fromRecurrence: false }
            : link)
          : [...current.noteLinks, { noteId: replacement.id, fromRecurrence: false }],
      });
      // The old note (and its job) remains valid for any other owner links/reuse.
      session.stageNewNote(replacement);
      return revised;
    });
  },
});
