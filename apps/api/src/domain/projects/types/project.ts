/**
 * A que projeto uma tarefa pertence (ADR 0021). Toda tarefa, de pessoa ou de agente, tem um; sem escolha, ela fica
 * no `personal`, o projeto padrao de cada usuario.
 */
export interface ProjectRef {
  id: string;
  name: string;
  /** O projeto padrao do usuario. Cada usuario tem um so, e o nome dele e sempre `personal`. */
  personal: boolean;
}
