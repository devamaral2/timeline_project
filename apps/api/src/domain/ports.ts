/**
 * Portas de saida do dominio. Vivem aqui — e nao no backend — para que
 * a infraestrutura de persistencia da API possa implementa-las.
 */
export type * from "./events/ports/event-repository";
export type * from "./events/ports/tag-repository";
export type * from "./catalog/ports/food-repository";
export type * from "./catalog/ports/meal-repository";
export type * from "./events/ports/timeline-event-query";
export type * from "./events/ports/daily-overview-query";
export type * from "./events/ports/workout-catalog";
export type * from "./tasks/ports/task-repository";
export type * from "./notes/ports/note-repository";
export type * from "./recurrences/ports/recurrence-repository";
export type * from "./agent/ports/scoped-sql-query";
export type * from "./agent/ports/entity-batch-writer";
export type * from "./agent/ports/agent-chat-ticket-store";
export type * from "./agent-chat/ports/agent-conversation-repository";
export type * from "./agent-chat/ports/agent-conversation-query";
