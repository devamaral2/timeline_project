import { z } from "zod";
import type { TrainingData, WorkoutInput } from "../../../domain";
import { skillText } from "../config/agent-config";
import { defineAgentSkill, fail } from "./agent-skill";
import { eventBaseFields, toBaseChanges, toCreateEventInput } from "./event-skill-fields";

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
  ...skillText("save_training_event"),
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
      return session.createEvent(toCreateEventInput(args, "training", { type: "training", data: { workouts } }));
    }

    return session.updateEvent(args.id, "training", async (current) => {
      if (workouts.length === 0) return current.revise(toBaseChanges(args));

      const added = await session.buildNote({ type: "training", data: { workouts } }, current.startedAt);
      const existing = await session.noteOfType(current, "training");

      // Sem treino anterior, a nota nova passa a fazer parte do evento.
      if (!existing) {
        session.stageNewNote(added);
        return current.revise({
          ...toBaseChanges(args),
          noteLinks: [...current.noteLinks, { noteId: added.id, fromRecurrence: false }],
        });
      }

      const previous = existing.data as TrainingData;
      const merged = [...previous.workouts, ...(added.data as TrainingData).workouts];
      const data: TrainingData = {
        workouts: merged,
        caloriesBurned: merged.reduce((total, workout) => total + workout.calories, 0),
      };
      await session.reviseNoteById(existing.id, (note) => note.revise({ data }));
      return current.revise(toBaseChanges(args));
    });
  },
});
