/**
 * Portas de saida do dominio. Vivem aqui, e nao na infraestrutura, para que a
 * persistencia da API possa implementa-las.
 */
export type * from "./tasks/ports/task-repository";
export type * from "./tasks/ports/task-card-query";
export type * from "./tasks/ports/task-request-link-query";
export type * from "./tasks/ports/tag-repository";
export type * from "./projects/ports/project-query";
export type * from "./projects/ports/project-repository";
export type * from "./artifacts/ports/artifact-repository";
export type * from "./artifacts/ports/artifact-task-link-query";
export type * from "./artifacts/ports/food-generation-repository";
export type * from "./artifacts/ports/workout-catalog";
export type * from "./recurrences/ports/recurrence-repository";
export type * from "./agent/ports/scoped-sql-query";
export type * from "./agent/ports/entity-batch-writer";
export type * from "./idempotency/ports/idempotency-store";
