"use client";

import { useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import type { EventDetailDto } from "@/models/events/application/dtos/event-detail.dto";
import type { Workout } from "@/models/events/domain/entities/training-event.entity";
import { cn } from "@/lib/utils";
import { anyDecimalStep, fieldInputClass, fieldLabelClass } from "../new-event-forms/field-styles";
import {
  CommonFields,
  type EditEventFormProps,
  FinishedAtField,
  FormActions,
  StartedAtField,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
  useSubmitEventUpdate,
} from "./shared";

type TrainingEventDetail = Extract<EventDetailDto, { type: "training" }>;

const workoutTypeLabels: Record<Workout["type"], string> = {
  treadmill: "Esteira",
  running: "Corrida",
  weightlifting: "Musculação",
  free: "Livre",
};

interface SetDraft {
  key: string;
  id?: string;
  exercise: string;
  repetitions: string;
  weight: string;
}

interface WorkoutDraft {
  key: string;
  id?: string;
  type: Workout["type"];
  calories: string;
  duration: string;
  pace: string;
  distance: string;
  sets: SetDraft[];
}

function newKey(): string {
  return crypto.randomUUID();
}

function newWorkout(): WorkoutDraft {
  return { key: newKey(), type: "free", calories: "", duration: "", pace: "", distance: "", sets: [] };
}

function newSet(): SetDraft {
  return { key: newKey(), exercise: "", repetitions: "", weight: "" };
}

function draftFromWorkout(workout: Workout): WorkoutDraft {
  return {
    key: newKey(),
    id: workout.id,
    type: workout.type,
    calories: String(workout.calories),
    duration: String(workout.duration),
    pace: "pace" in workout ? String(workout.pace) : "",
    distance: "distance" in workout ? String(workout.distance) : "",
    sets:
      workout.type === "weightlifting"
        ? workout.sets.map((set) => ({
            key: newKey(),
            id: set.id,
            exercise: set.exercise,
            repetitions: String(set.repetitions),
            weight: String(set.weight),
          }))
        : [],
  };
}

const selectClass = fieldInputClass + " pr-8";
const smallInputClass =
  "h-9 rounded-lg border border-border bg-background px-2.5 text-[13px] text-foreground outline-none transition-colors focus:border-primary";

export function TrainingEditForm({
  eventId,
  event,
  onCancel,
  onClose,
  onUpdated,
}: EditEventFormProps<TrainingEventDetail>) {
  const [workouts, setWorkouts] = useState<WorkoutDraft[]>(event.data.workouts.map(draftFromWorkout));
  const [description, setDescription] = useState(event.description);
  const [tags, setTags] = useState<string[]>(event.tags);
  const [startedAt, setStartedAt] = useState(toDatetimeLocalValue(event.startedAt));
  const [finishedAt, setFinishedAt] = useState(toDatetimeLocalValue(event.finishedAt));
  const { submit, submitting, error } = useSubmitEventUpdate({ eventId, onUpdated, onClose });

  function updateWorkout(key: string, patch: Partial<WorkoutDraft>) {
    setWorkouts((current) => current.map((w) => (w.key === key ? { ...w, ...patch } : w)));
  }

  function updateSet(workoutKey: string, setKey: string, patch: Partial<SetDraft>) {
    setWorkouts((current) =>
      current.map((w) =>
        w.key === workoutKey
          ? { ...w, sets: w.sets.map((s) => (s.key === setKey ? { ...s, ...patch } : s)) }
          : w,
      ),
    );
  }

  function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();

    const builtWorkouts: Workout[] = workouts.map((w) => {
      const base = { id: w.id, calories: Number(w.calories) || 0, duration: Number(w.duration) || 0 };
      if (w.type === "weightlifting") {
        return {
          type: "weightlifting",
          ...base,
          sets: w.sets.map((s) => ({
            id: s.id,
            exercise: s.exercise.trim(),
            repetitions: Number(s.repetitions) || 0,
            weight: Number(s.weight) || 0,
          })),
        };
      }
      if (w.type === "free") return { type: "free", ...base };
      return { type: w.type, ...base, pace: Number(w.pace) || 0, distance: Number(w.distance) || 0 };
    });

    void submit({
      data: { workouts: builtWorkouts },
      description: description.trim(),
      tags,
      startedAt: fromDatetimeLocalValue(startedAt),
      finishedAt: fromDatetimeLocalValue(finishedAt),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <span className={fieldLabelClass}>Treinos</span>

        {workouts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[13px] text-muted-foreground">
            Nenhum treino adicionado ainda.
          </p>
        ) : null}

        {workouts.map((workout) => (
          <div key={workout.key} className="flex flex-col gap-2.5 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <select
                value={workout.type}
                onChange={(event) =>
                  updateWorkout(workout.key, { type: event.target.value as Workout["type"] })
                }
                className={selectClass}
              >
                {Object.entries(workoutTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setWorkouts((current) => current.filter((w) => w.key !== workout.key))}
                aria-label="Remover treino"
                className="ml-auto grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-muted-foreground">Calorias</label>
                <input
                  type="number"
                  min={0}
                  step={anyDecimalStep}
                  value={workout.calories}
                  onChange={(event) => updateWorkout(workout.key, { calories: event.target.value })}
                  className={smallInputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-muted-foreground">Duração (min)</label>
                <input
                  type="number"
                  min={0}
                  step={anyDecimalStep}
                  value={workout.duration}
                  onChange={(event) => updateWorkout(workout.key, { duration: event.target.value })}
                  className={smallInputClass}
                />
              </div>

              {workout.type === "treadmill" || workout.type === "running" ? (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-[12px] text-muted-foreground">Ritmo (min/km)</label>
                    <input
                      type="number"
                      min={0}
                      step={anyDecimalStep}
                      value={workout.pace}
                      onChange={(event) => updateWorkout(workout.key, { pace: event.target.value })}
                      className={smallInputClass}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[12px] text-muted-foreground">Distância (km)</label>
                    <input
                      type="number"
                      min={0}
                      step={anyDecimalStep}
                      value={workout.distance}
                      onChange={(event) => updateWorkout(workout.key, { distance: event.target.value })}
                      className={smallInputClass}
                    />
                  </div>
                </>
              ) : null}
            </div>

            {workout.type === "weightlifting" ? (
              <div className="flex flex-col gap-2">
                {workout.sets.map((set) => (
                  <div key={set.key} className="flex items-center gap-1.5 sm:gap-2">
                    <input
                      type="text"
                      placeholder="Exercício"
                      value={set.exercise}
                      onChange={(event) =>
                        updateSet(workout.key, set.key, { exercise: event.target.value })
                      }
                      className={cn(smallInputClass, "min-w-0 flex-1")}
                    />
                    <input
                      type="number"
                      min={0}
                      step={anyDecimalStep}
                      placeholder="Reps"
                      value={set.repetitions}
                      onChange={(event) =>
                        updateSet(workout.key, set.key, { repetitions: event.target.value })
                      }
                      className={cn(smallInputClass, "w-12 min-w-0 shrink-0 sm:w-16")}
                    />
                    <input
                      type="number"
                      min={0}
                      step={anyDecimalStep}
                      placeholder="Kg"
                      value={set.weight}
                      onChange={(event) => updateSet(workout.key, set.key, { weight: event.target.value })}
                      className={cn(smallInputClass, "w-12 min-w-0 shrink-0 sm:w-16")}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateWorkout(workout.key, {
                          sets: workout.sets.filter((s) => s.key !== set.key),
                        })
                      }
                      aria-label="Remover série"
                      className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <X aria-hidden className="size-3.5" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => updateWorkout(workout.key, { sets: [...workout.sets, newSet()] })}
                  className="inline-flex items-center gap-1 self-start text-[12.5px] font-medium text-primary hover:underline"
                >
                  <Plus aria-hidden className="size-3.5" />
                  Adicionar série
                </button>
              </div>
            ) : null}
          </div>
        ))}

        <button
          type="button"
          onClick={() => setWorkouts((current) => [...current, newWorkout()])}
          className="inline-flex items-center justify-center gap-1.5 self-start rounded-lg border border-dashed border-border px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Plus aria-hidden className="size-4" />
          Adicionar treino
        </button>
      </div>

      <CommonFields
        description={description}
        onDescriptionChange={setDescription}
        tags={tags}
        onTagsChange={setTags}
      />

      <StartedAtField value={startedAt} onChange={setStartedAt} />
      <FinishedAtField value={finishedAt} onChange={setFinishedAt} />

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <FormActions
        onBack={onCancel}
        submitting={submitting}
        submitLabel="Salvar alterações"
        submittingLabel="Salvando..."
        backLabel="Cancelar"
      />
    </form>
  );
}
