/**
 * Fixtures dos projetos: as respostas de `GET /api/projects` e `POST /api/projects`, validadas pelo `projectSchema`
 * do contrato. O formulário da tarefa lista, busca e cria por elas.
 */
import { createProjectInputSchema, projectSchema } from "../../../packages/contracts/src/schemas";
import { ACAI_PROJECT, AGENT_SKILLS_PROJECT, PERSONAL_PROJECT, TIMELINE_PROJECT } from "./project";

/** A lista como a API a devolve: `diario` primeiro e os outros por nome. */
const list = [PERSONAL_PROJECT, ACAI_PROJECT, AGENT_SKILLS_PROJECT, TIMELINE_PROJECT];

export function projectsFixtures(): Record<string, unknown> {
  return {
    "projects-list": projectSchema.array().parse(list),
    "projects-created": projectSchema.parse({ id: "project-new", name: "braid", personal: false }),
    "projects-create-input": createProjectInputSchema.parse({ name: "braid" }),
  };
}
