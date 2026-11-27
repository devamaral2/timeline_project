import type { ProjectDto } from "@repo/contracts";
import { projectSchema } from "@repo/contracts/schemas";
import { z } from "zod";
import type { FakeArea } from ".";

/**
 * Área de projetos: a lista do usuário. Enquanto nada escolhe o projeto, toda tarefa e todo pedido da API falsa
 * ficam no `personal`, como na API real.
 */

/** O projeto padrão de todo dado criado na API falsa. */
export const FAKE_PERSONAL_PROJECT: ProjectDto = { id: "project-personal", name: "personal", personal: true };

const PROJECTS = "projects";

export const projectsArea: FakeArea = {
  name: "projects",
  routes: [
    {
      method: "GET",
      path: "/api/projects",
      output: z.array(projectSchema),
      handle: (_request, store) => {
        const seeded = [...store.table<ProjectDto>(PROJECTS).values()];
        const rest = seeded.filter((project) => !project.personal).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        return { status: 200, body: [FAKE_PERSONAL_PROJECT, ...rest] };
      },
    },
  ],
};
