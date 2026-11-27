/** O projeto nao existe ou nao e do usuario: os dois casos respondem igual, para nao revelar projetos de outros. */
export class ProjectNotFoundError extends Error {
  constructor() {
    super("Project not found");
  }
}
