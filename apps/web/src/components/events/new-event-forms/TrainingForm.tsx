"use client";

import { useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import type { WorkoutCode, WorkoutInput } from "@repo/entities/contracts";
import { cn } from "@/lib/utils";
import { iconButtonClass } from "@/components/ui/button-styles";
import { addRowButtonClass, emptyRowClass, inlineLinkClass, smallInputClass } from "./field-styles";
import { workoutCodeLabels } from "./workout-codes";
import {
  CommonFields,
  type EventFormProps,
  FormActions,
  anyDecimalStep,
  fieldInputClass,
  fieldLabelClass,
  useSubmitEvent,
} from "./shared";

interface SetDraft {
  key: string;
  exercise: string;
  repetitions: string;
  weight: string;
}

interface WorkoutDraft {
  key: string;
  workoutCode: WorkoutCode;
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
  return {
    key: newKey(),
    workoutCode: "free",
    calories: "",
    duration: "",
    pace: "",
    distance: "",
    sets: [],
  };
}

function newSet(): SetDraft {
  return { key: newKey(), exercise: "", repetitions: "", weight: "" };
}

const selectClass = fieldInputClass + " pr-8";

export function TrainingForm({ onBack, onClose, onCreated }: EventFormProps) {
  const [workouts, setWorkouts] = useState<WorkoutDraft[]>([]);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const { submit, submitting, error } = useSubmitEvent({ onCreated, onClose });

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

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // A entrada de criacao nao carrega `workoutName` nem `caloriesBurned`: o
    // nome vem do catalogo do backend e a soma e feita la. O cliente diz o que
    // fez, nao como o registro fica.
    const builtWorkouts: WorkoutInput[] = workouts.map((w) => {
      const base = { calories: Number(w.calories) || 0, duration: Number(w.duration) || 0 };
      if (w.workoutCode === "weightlifting") {
        return {
          ...base,
          workoutCode: "weightlifting",
          sets: w.sets.map((s) => ({
            exercise: s.exercise.trim(),
            repetitions: Number(s.repetitions) || 0,
            weight: Number(s.weight) || 0,
          })),
        };
      }
      if (w.workoutCode === "free") return { ...base, workoutCode: "free" };
      return {
        ...base,
        workoutCode: w.workoutCode,
        pace: Number(w.pace) || 0,
        distance: Number(w.distance) || 0,
      };
    });

    void submit({
      items: [{ type: "training", data: { workouts: builtWorkouts } }],
      description: description.trim() || undefined,
      tags,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <span className={fieldLabelClass}>Treinos</span>

        {workouts.length === 0 ? (
          <p className={emptyRowClass}>Nenhum treino adicionado ainda.</p>
        ) : null}

        {workouts.map((workout) => (
          <div
            key={workout.key}
            className="flex flex-col gap-2.5 rounded-lg border border-border p-3"
          >
            <div className="flex items-center gap-2">
              <select
                value={workout.workoutCode}
                onChange={(event) =>
                  updateWorkout(workout.key, { workoutCode: event.target.value as WorkoutCode })
                }
                className={selectClass}
              >
                {Object.entries(workoutCodeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  setWorkouts((current) => current.filter((w) => w.key !== workout.key))
                }
                aria-label="Remover treino"
                className={cn("ml-auto", iconButtonClass)}
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

              {workout.workoutCode === "treadmill" || workout.workoutCode === "running" ? (
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
                      onChange={(event) =>
                        updateWorkout(workout.key, { distance: event.target.value })
                      }
                      className={smallInputClass}
                    />
                  </div>
                </>
              ) : null}
            </div>

            {workout.workoutCode === "weightlifting" ? (
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
                      onChange={(event) =>
                        updateSet(workout.key, set.key, { weight: event.target.value })
                      }
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
                      className={iconButtonClass}
                    >
                      <X aria-hidden className="size-3.5" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => updateWorkout(workout.key, { sets: [...workout.sets, newSet()] })}
                  className={inlineLinkClass}
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
          className={addRowButtonClass}
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

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <FormActions onBack={onBack} submitting={submitting} />
    </form>
  );
}
