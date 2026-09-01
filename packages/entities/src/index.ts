export * from "./events/entities/event.entity";
export * from "./events/entities/legacy-event.entity";
// Alias temporario: apps/api ainda consome EventProps ate a Task 9 (o corte)
export type { LegacyEventProps as EventProps } from "./events/entities/legacy-event.entity";
export * from "./events/entities/food-event.entity";
export * from "./events/entities/routine-event.entity";
export * from "./events/entities/sleep-event.entity";
export * from "./events/entities/training-event.entity";
export * from "./events/entities/event-item.entity";
export * from "./events/value-objects/event-id";
export * from "./events/value-objects/interruption";
export * from "./events/value-objects/tag-list";
export * from "./events/types/event-type";
export * from "./events/types/event-priority";
export * from "./events/types/missed-flag";
export * from "./events/errors/event.errors";
export * from "./events/items/event-item-definition";
export * from "./events/items/event-item-registry";
export * from "./events/items/routine-data";
export * from "./events/items/meal-item";
export * from "./events/items/sleep-item";

// FoodItem e WorkoutSet colidem com os tipos legados equivalentes durante a
// fase de expansao (Task 2 a 8). Os dois lados coexistem sob nomes explicitos
// ate a Task 9 remover as entidades legadas e liberar o nome final.
export {
  parseFoodItem,
  type FoodItem as EventItemFoodItem,
  type FoodItemMacronutrients,
} from "./events/items/food-item";
export {
  parseTrainingData,
  type WorkoutCode,
  type WorkoutSet as EventItemWorkoutSet,
  type WorkoutSnapshotBase,
  type CardioWorkoutSnapshot,
  type WeightliftingWorkoutSnapshot,
  type FreeWorkoutSnapshot,
  type WorkoutSnapshot,
  type TrainingData as EventItemTrainingData,
  type WorkoutInput,
  type TrainingInputData as EventItemTrainingInputData,
} from "./events/items/training-data";
