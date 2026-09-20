import type { AgentTool } from "../gateways/agent.gateway";
import type { AgentSkill, AgentSkillContext } from "./agent-skill";
import { deleteEntitySkill } from "./delete-entity.skill";
import { mealEventSkill } from "./meal-event.skill";
import { noteSkill } from "./note.skill";
import { queryDataSkill } from "./query-data.skill";
import { routineEventSkill } from "./routine-event.skill";
import { sleepEventSkill } from "./sleep-event.skill";
import { taskSkill } from "./task.skill";
import { trainingEventSkill } from "./training-event.skill";

/** Uma skill por tipo de evento, uma para tarefas, uma para notas, mais consulta e remocao. */
export const AGENT_SKILLS: readonly AgentSkill[] = [
  queryDataSkill,
  trainingEventSkill,
  mealEventSkill,
  sleepEventSkill,
  routineEventSkill,
  taskSkill,
  noteSkill,
  deleteEntitySkill,
];

export function bindAgentTools(skills: readonly AgentSkill[], context: AgentSkillContext): AgentTool[] {
  return skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    parameters: skill.parameters,
    execute: (args: unknown) => skill.run(args, context),
  }));
}
