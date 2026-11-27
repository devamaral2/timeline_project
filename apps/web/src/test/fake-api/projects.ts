import type { ProjectDto } from "@repo/contracts";
import { createProjectInputSchema, projectSchema } from "@repo/contracts/schemas";
import { z } from "zod";
import type { FakeArea, FakeStore } from ".";

/**
 * Área de projetos: a lista do usuário e a criação. Enquanto nada escolhe o projeto, toda tarefa e todo pedido da API
 * falsa ficam no `diario`, como na API real. O nome vale como a API o guarda: sem os espaços das pontas, de 1 a 60
 * caracteres, e único sem distinguir maiúsculas (o `diario` já ocupa o dele).
 */

/** O projeto padrão de todo dado criado na API falsa. */
export const FAKE_PERSONAL_PROJECT: ProjectDto = { id: "project-personal", name: "diario", personal: true };

const PROJECTS = "projects";
const MAX_NAME_LENGTH = 60;

function others(store: FakeStore): ProjectDto[] {
  return [...store.table<ProjectDto>(PROJECTS).values()].filter((project) => !project.personal);
}

/** O projeto pelo id: o `diario` ou um criado (ou semeado) na API falsa. `undefined` quando não existe. */
export function fakeProjectById(store: FakeStore, id: string): ProjectDto | undefined {
  return id === FAKE_PERSONAL_PROJECT.id ? FAKE_PERSONAL_PROJECT : store.table<ProjectDto>(PROJECTS).get(id);
}

export const projectsArea: FakeArea = {
  name: "projects",
  routes: [
    {
      method: "GET",
      path: "/api/projects",
      output: z.array(projectSchema),
      handle: (_request, store) => {
        const rest = others(store).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        return { status: 200, body: [FAKE_PERSONAL_PROJECT, ...rest] };
      },
    },
    {
      method: "POST",
      path: "/api/projects",
      input: createProjectInputSchema,
      output: projectSchema,
      handle: (request, store) => {
        const name = (request.body as { name: string }).name.trim();
        const length = [...name].length;
        if (length === 0 || length > MAX_NAME_LENGTH) return { status: 400 };
        const taken = [FAKE_PERSONAL_PROJECT, ...others(store)].some((project) => project.name.toLowerCase() === name.toLowerCase());
        if (taken) return { status: 409 };
        const project: ProjectDto = { id: store.nextId("project"), name, personal: false };
        store.table<ProjectDto>(PROJECTS).set(project.id, project);
        return { status: 201, body: project };
      },
    },
  ],
};
