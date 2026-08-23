import { z } from "zod";
import { baseSkillFields, defineEventSkill, toBaseEventInput } from "./event-skill";

const workoutSetSchema = z.object({
  exercise: z.string().describe("Nome do exercício, ex: 'supino reto'."),
  repetitions: z.number().int().positive().describe("Repetições na série."),
  weight: z.number().nonnegative().describe("Carga em quilogramas. Use 0 para peso corporal."),
});

const cardioFields = {
  calories: z.number().nonnegative().describe("Calorias queimadas em kcal."),
  duration: z.number().positive().describe("Duração em MINUTOS."),
  pace: z.number().nonnegative().describe("Ritmo em minutos por quilômetro."),
  distance: z.number().nonnegative().describe("Distância em QUILÔMETROS."),
};

// z.union e não z.discriminatedUnion de propósito: o discriminatedUnion serializa
// como `oneOf`, que o subset de JSON Schema aceito por function calling da família
// OpenAI não suporta — alguns provedores rejeitam a tool com 400. z.union emite
// `anyOf`. A validação é equivalente aqui, já que cada braço tem um `type` literal.
const workoutSchema = z.union([
  z.object({ type: z.literal("running"), ...cardioFields }),
  z.object({ type: z.literal("treadmill"), ...cardioFields }),
  z.object({
    type: z.literal("weightlifting"),
    calories: z.number().nonnegative().describe("Calorias queimadas em kcal."),
    duration: z.number().positive().describe("Duração em MINUTOS."),
    sets: z.array(workoutSetSchema).describe("Séries executadas."),
  }),
  z.object({
    type: z.literal("free"),
    calories: z.number().nonnegative().describe("Calorias queimadas em kcal."),
    duration: z.number().positive().describe("Duração em MINUTOS."),
  }),
]);

const parameters = z.object({
  workouts: z.array(workoutSchema).min(1).describe("Um item por atividade praticada."),
  ...baseSkillFields,
});

export const createTrainingEventSkill = defineEventSkill({
  name: "create_training_event",
  description:
    "Registra um treino ou atividade física: corrida, esteira, musculação, ou qualquer outro exercício.",
  instructions: [
    "create_training_event — unidades são obrigatórias e não têm default:",
    "- duration SEMPRE em minutos. 'uma hora e meia' = 90, 'quarenta minutos' = 40, '2h' = 120.",
    "- distance SEMPRE em quilômetros. '5000 metros' = 5.",
    "- pace em minutos por quilômetro. Se o usuário não informar, calcule: pace = duration / distance.",
    "- calories em kcal.",
    "Escolha o type certo: 'running' para corrida na rua, 'treadmill' para esteira,",
    "'weightlifting' quando houver exercícios com séries e carga, 'free' para o resto.",
    "Registre um item em workouts por atividade. Nunca invente números que o usuário não deu —",
    "se ele não informou calorias, use 0.",
  ].join("\n"),
  parameters,
  toCreateEventInput: (args) => ({
    type: "training",
    data: { workouts: args.workouts },
    ...toBaseEventInput(args),
  }),
});
