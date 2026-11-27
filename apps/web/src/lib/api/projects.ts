import type { ProjectDto } from "@repo/contracts";
import { apiRequest } from "./client-request";

/** Rota que cada funcao desta area chama, no formato do catalogo da API. `route-coverage.test.ts` confere. */
export const projectsRoutes = {
  listProjects: "GET /api/projects",
} as const;

/** Os projetos do usuario: `personal` primeiro e os outros por nome. */
export function listProjects(): Promise<ProjectDto[]> {
  return apiRequest<ProjectDto[]>("GET", "/api/projects");
}
