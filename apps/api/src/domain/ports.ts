/**
 * Portas de saida do dominio. Vivem aqui, e nao na infraestrutura, para que a
 * persistencia da API possa implementa-las.
 */
export type * from "./events/ports/event-repository";
export type * from "./events/ports/event-card-query";
export type * from "./events/ports/tag-repository";
export type * from "./artifacts/ports/artifact-repository";
export type * from "./artifacts/ports/artifact-event-link-query";
export type * from "./artifacts/ports/food-generation-repository";
export type * from "./artifacts/ports/workout-catalog";
export type * from "./recurrences/ports/recurrence-repository";
export type * from "./agent/ports/scoped-sql-query";
export type * from "./agent/ports/entity-batch-writer";
export type * from "./idempotency/ports/idempotency-store";
