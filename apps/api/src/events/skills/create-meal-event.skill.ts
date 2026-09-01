import { z } from "zod";
import { baseSkillFields, defineEventSkill, toBaseEventInput } from "./event-skill";

const parameters = z.object({
  inputText: z
    .string()
    .min(1)
    .describe(
      "Descrição da refeição com os alimentos e as quantidades, do jeito que o usuário informou.",
    ),
  ...baseSkillFields,
});

export const createMealEventSkill = defineEventSkill({
  name: "create_meal_event",
  description:
    "Registra uma refeição ou qualquer alimento/bebida consumido pelo usuário.",
  instructions: [
    "create_meal_event — copie para inputText a descrição da refeição preservando as",
    "quantidades ('dois ovos mexidos e uma fatia de pão integral'). NÃO calcule calorias,",
    "macronutrientes ou micronutrientes: um passo posterior faz a análise nutricional a",
    "partir desse texto. Seu trabalho aqui é apenas isolar o que foi consumido.",
  ].join("\n"),
  parameters,
  toCreateEventInput: (args) => ({
    items: [{ type: "meal", data: { inputText: args.inputText } }],
    ...toBaseEventInput(args),
  }),
});
