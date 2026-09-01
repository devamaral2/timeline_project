/**
 * Portas de saida do dominio. Vivem aqui — e nao no backend — para que
 * @repo/persistence possa implementa-las sem depender de apps/api.
 */
export type * from "./events/ports/event-repository";
export type * from "./events/ports/tag-repository";
export type * from "./events/ports/event-aggregate-repository";
