import { ProjectValidationError } from "../errors/project.errors";

/** O tamanho maximo do nome de um projeto, em caracteres, depois de tirar os espacos das pontas. */
export const MAX_PROJECT_NAME_LENGTH = 60;

/**
 * O nome como fica guardado: sem espacos nas pontas, de 1 a 60 caracteres (contados por ponto de codigo, como o
 * banco: um emoji vale um). Recusa o que nao e texto.
 */
export function normalizeProjectName(raw: unknown): string {
  if (typeof raw !== "string") throw new ProjectValidationError("Project name must be a string");
  const name = raw.trim();
  const length = [...name].length;
  if (length === 0) throw new ProjectValidationError("Project name is required");
  if (length > MAX_PROJECT_NAME_LENGTH) {
    throw new ProjectValidationError(`Project name has at most ${MAX_PROJECT_NAME_LENGTH} characters`);
  }
  return name;
}
