import { createFoodEventSkill } from "./create-food-event.skill";
import { createRoutineEventSkill } from "./create-routine-event.skill";
import { createSleepEventSkill } from "./create-sleep-event.skill";
import { createTrainingEventSkill } from "./create-training-event.skill";
import type { EventSkill } from "./event-skill";

/**
 * A coleção de skills disponível para o agente. Adicionar uma capacidade nova é
 * criar o arquivo da skill e incluí-la aqui — nada no loop do agente muda.
 */
export const EVENT_SKILLS: readonly EventSkill[] = [
  createTrainingEventSkill,
  createFoodEventSkill,
  createSleepEventSkill,
  createRoutineEventSkill,
];

export function findEventSkill(name: string): EventSkill | undefined {
  return EVENT_SKILLS.find((skill) => skill.name === name);
}
