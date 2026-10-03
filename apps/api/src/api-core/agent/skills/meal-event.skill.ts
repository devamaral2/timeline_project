import { z } from "zod";
import { calculateMealTotals, type MealItem } from "../../../domain";
import { defineAgentSkill, fail } from "./agent-skill";
import { eventBaseFields, toBaseChanges, toCreateEventInput } from "./event-skill-fields";

export const mealEventSkill = defineAgentSkill({
  name: "save_meal_event",
  progressLabel: "Preparando refeição",
  description: "Cria ou altera uma refeição, ou qualquer alimento ou bebida consumido.",
  instructions: [
    "save_meal_event — copie para inputText os alimentos com as quantidades, como o usuário disse",
    "('300g de macarrão à bolonhesa'). NÃO calcule calorias nem nutrientes: um passo posterior",
    "faz a análise a partir desse texto.",
    "Com id, os alimentos de inputText são ACRESCENTADOS à refeição existente; os anteriores ficam.",
    "Antes de criar, consulte se já existe a mesma refeição no dia (ex.: almoço de hoje) — se",
    "existir, acrescente a ela em vez de criar outra.",
  ].join("\n"),
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
