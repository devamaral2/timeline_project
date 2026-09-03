/**
 * Shapes que a API HTTP fala. E o unico subpath que o frontend consome, sempre
 * com `import type` — o JS emitido aqui e vazio de proposito, para que o front
 * nao carregue nenhuma classe de dominio.
 */
export type * from "./events/contracts/create-event.input";
export type * from "./events/contracts/daily-overview.dto";
export type * from "./events/contracts/event-detail.dto";
export type * from "./events/contracts/event-item.dto";
export type * from "./events/contracts/tag-suggestion.dto";
export type * from "./events/contracts/timeline-event-card.dto";
export type * from "./events/contracts/timeline-event-page.dto";
export type * from "./events/contracts/update-event.input";

// Tipos de dados de dominio que os DTOs referenciam, reexportados para que o
// front nunca precise importar o subpath raiz (onde vivem as classes).
//
// Sao os payloads dos itens, e nao mais os das subclasses de evento: `FoodItem`
// e `WorkoutSet` aqui sao os do modelo por itens. Na raiz do pacote os dois
// nomes ainda estao ocupados pelos legados e por isso convivem sob apelidos
// (`EventItemFoodItem`, `EventItemWorkoutSet`) — mas o frontend nunca viu o
// modelo legado, e nao ha razao para ele aprender os apelidos de uma transicao
// que so acontece do lado do servidor.
export type { EventType } from "./events/types/event-type";
export type { EventPriority } from "./events/types/event-priority";
export type { RoutineData } from "./events/items/routine-data";
export type { FoodItem, FoodItemMacronutrients } from "./events/items/food-item";
export type { MealItem, MealTotals } from "./events/items/meal-item";
export type { SleepItem } from "./events/items/sleep-item";
export type {
  WorkoutCode,
  WorkoutSet,
  WorkoutSnapshotBase,
  CardioWorkoutSnapshot,
  WeightliftingWorkoutSnapshot,
  FreeWorkoutSnapshot,
  WorkoutSnapshot,
  TrainingData,
  WorkoutInput,
  TrainingInputData,
} from "./events/items/training-data";
