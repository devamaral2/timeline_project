/**
 * Shapes que a API HTTP fala. E o unico subpath que os clientes consomem,
 * sempre com `import type`: o JS emitido aqui e vazio de proposito, para que
 * nenhum cliente carregue classe de dominio.
 */
export type * from "./events/event-types";
export type * from "./events/event.dto";
export type * from "./events/event.input";
export type * from "./events/tag-suggestion.dto";
export type * from "./events/place-suggestion.dto";
export type * from "./events/notification-offset-minutes";
export type * from "./artifacts/artifact.dto";
export type * from "./artifacts/artifact.input";
export type * from "./artifacts/types/agent-file-data";
export type * from "./artifacts/types/food-data";
export type * from "./artifacts/types/sleep-data";
export type * from "./artifacts/types/text-data";
export type * from "./artifacts/types/training-data";
export type * from "./artifacts/types/workout-data";
export type * from "./recurrences/recurrence-rule";
export type * from "./recurrences/recurrence.dto";
export type * from "./agent/agent-trace.dto";
export type * from "./agent/request.dto";
