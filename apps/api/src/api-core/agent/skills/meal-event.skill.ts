import { z } from "zod";
import { calculateMealTotals, type MealItem } from "../../../domain";
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
      if (!inputText) return current.revise(toBaseChanges(args));

      const added = await session.buildNote({ type: "meal", data: { inputText } }, current.startedAt);
      const existing = await session.noteOfType(current, "meal");

      // Sem refeicao anterior, a nova passa a fazer parte do evento.
      if (!existing) {
        session.stageNewNote(added);
        return current.revise({
          ...toBaseChanges(args),
          noteLinks: [...current.noteLinks, { noteId: added.id, fromRecurrence: false }],
        });
      }

      const previous = existing.data as MealItem;
      const foodItems = [...previous.foodItems, ...(added.data as MealItem).foodItems];
      const data: MealItem = {
        ...previous,
        description: [previous.description, inputText].filter(Boolean).join("; "),
        foodItems,
        totals: calculateMealTotals(foodItems),
      };
      await session.reviseNoteById(existing.id, (note) => note.revise({ data }));
      return current.revise(toBaseChanges(args));
    });
  },
});
