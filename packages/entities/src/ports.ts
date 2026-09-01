/**
 * Portas de saida do dominio. Vivem aqui — e nao no backend — para que
 * @repo/persistence possa implementa-las sem depender de apps/api.
 */
export type * from "./events/ports/event-repository";
export type * from "./events/ports/tag-repository";
export type * from "./events/ports/event-aggregate-repository";
export type * from "./catalog/ports/food-repository";
export type * from "./catalog/ports/meal-repository";
export type * from "./events/ports/timeline-event-query";
export type * from "./events/ports/daily-overview-query";
export type * from "./events/ports/workout-catalog";
export type * from "./events/ports/legacy-tag-repository";
