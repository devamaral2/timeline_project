import { z } from "zod";
import type { TrainingData, WorkoutInput } from "@repo/entities";
import { defineAgentSkill, fail } from "./agent-skill";
import { eventBaseFields, primaryItemOf, toBaseChanges, toCreateEventInput, withPrimaryData } from "./event-skill-fields";

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

// z.union e nao z.discriminatedUnion de proposito: o discriminatedUnion serializa
// como `oneOf`, que o function calling da familia OpenAI nao aceita — alguns
// provedores recusam a tool com 400. z.union emite `anyOf`.
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

type WorkoutArgs = z.infer<typeof workoutSchema>;

function toWorkoutInput(workout: WorkoutArgs): WorkoutInput {
  if (workout.type === "weightlifting") {
    return { workoutCode: "weightlifting", calories: workout.calories, duration: workout.duration, sets: workout.sets };
  }
  if (workout.type === "free") {
    return { workoutCode: "free", calories: workout.calories, duration: workout.duration };
  }
  return {
    workoutCode: workout.type,
    calories: workout.calories,
    duration: workout.duration,
    pace: workout.pace,
    distance: workout.distance,
  };
}

export const trainingEventSkill = defineAgentSkill({
  name: "save_training_event",
  progressLabel: "Preparando treino",
  description:
    "Cria ou altera um treino ou atividade física: corrida, esteira, musculação ou outro exercício.",
  instructions: [
    "save_training_event — unidades obrigatórias e sem default:",
    "- duration SEMPRE em minutos ('uma hora e meia' = 90); distance SEMPRE em km ('5000 metros' = 5).",
    "- pace em min/km; se o usuário não informou, calcule duration / distance. calories em kcal (0 se não informou).",
    "- type: 'running' corrida na rua, 'treadmill' esteira, 'weightlifting' séries com carga, 'free' o resto.",
    "Com id, os workouts enviados são ACRESCENTADOS ao treino existente; os anteriores ficam.",
  ].join("\n"),
  parameters: z.object({
    ...eventBaseFields,
    workouts: z
      .array(workoutSchema)
      .optional()
      .describe("Um item por atividade. Obrigatório na criação; numa alteração, atividades a acrescentar."),
  }),
  run: async (args, { session }) => {
    const workouts = args.workouts?.map(toWorkoutInput) ?? [];

    if (!args.id) {
      if (workouts.length === 0) return fail("workouts é obrigatório para criar um treino.");
      return session.createEvent(toCreateEventInput(args, { type: "training", data: { workouts } }));
    }

    return session.updateEvent(args.id, "training", async (current) => {
      if (workouts.length === 0) return current.revise(toBaseChanges(args));

      const added = await session.buildItem({ type: "training", data: { workouts } }, current.startedAt);
      const existing = primaryItemOf(current).data as TrainingData;
      const merged = [...existing.workouts, ...(added.data as TrainingData).workouts];
      return current.revise({
        ...toBaseChanges(args),
        items: withPrimaryData(current, {
          workouts: merged,
          caloriesBurned: merged.reduce((total, workout) => total + workout.calories, 0),
        }),
      });
    });
  },
});
