/**
 * Shapes que a API HTTP fala. E o unico subpath que o frontend consome, sempre
 * com `import type` — o JS emitido aqui e vazio de proposito, para que o front
 * nao carregue nenhuma classe de dominio.
 */
export type * from "./events/contracts/create-event.input";
export type * from "./events/contracts/daily-overview.dto";
export type * from "./events/contracts/event-detail.dto";
export type * from "./events/contracts/tag-suggestion.dto";
export type * from "./events/contracts/timeline-event-card.dto";
export type * from "./events/contracts/update-event.input";

// Tipos de dados de dominio que os DTOs referenciam, reexportados para que o
// front nunca precise importar o subpath raiz (onde vivem as classes).
export type { EventType } from "./events/types/event-type";
export type { FoodItem, FoodTotals, FoodEventData } from "./events/entities/food-event.entity";
export type { SleepEventData } from "./events/entities/sleep-event.entity";
export type {
  Workout,
  WorkoutSet,
  TreadmillWorkout,
  RunningWorkout,
  WeightliftingWorkout,
  FreeWorkout,
  TrainingEventData,
  TrainingEventInputData,
} from "./events/entities/training-event.entity";
