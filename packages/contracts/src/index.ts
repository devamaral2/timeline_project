/**
 * Shapes que a API HTTP fala. E o unico subpath que os clientes consomem,
 * com `import type`: o JS emitido aqui e vazio de proposito, para que nenhum
 * cliente carregue classe de dominio. A excecao sao os grupos de status de
 * agente (`agent-status-groups`): valores sem dependencia, que todo cliente
 * pergunta em vez de repetir listas de status.
 */
export type * from "./tasks/task-types";
export * from "./tasks/agent-status-groups";
export type * from "./tasks/task.dto";
export type * from "./tasks/task.input";
export type * from "./tasks/daily-reading";
export type * from "./tasks/tag-suggestion.dto";
export type * from "./tasks/place-suggestion.dto";
export type * from "./tasks/notification-offset-minutes";
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
export type * from "./agent/model.dto";
