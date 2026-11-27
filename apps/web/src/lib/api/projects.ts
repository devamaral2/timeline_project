import type { ProjectDto } from "@repo/contracts";
import { apiRequest } from "./client-request";

/** Rota que cada funcao desta area chama, no formato do catalogo da API. `route-coverage.test.ts` confere. */
export const projectsRoutes = {
  listProjects: "GET /api/projects",
  createProject: "POST /api/projects",
} as const;

/** Os projetos do usuario: `personal` primeiro e os outros por nome. */
export function listProjects(): Promise<ProjectDto[]> {
  return apiRequest<ProjectDto[]>("GET", "/api/projects");
}

/**
 * Cria um projeto pelo nome. Nome repetido (sem distinguir maiusculas) volta como `ApiRequestError` de tipo
 * `conflict`; nome vazio ou longo demais, `invalid_input`.
 */
export function createProject(name: string): Promise<ProjectDto> {
  return apiRequest<ProjectDto>("POST", "/api/projects", { body: { name } });
}
