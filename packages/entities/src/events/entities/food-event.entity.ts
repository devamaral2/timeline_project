import { Event, type EventProps } from "./event.entity";
import { EventId } from "../value-objects/event-id";
import { TagList } from "../value-objects/tag-list";
import { ulid } from "ulid";

export interface FoodItem {
  id?: string;
  food: string;
  portion: string;
  approximateWeightGrams: number;
  caloriesKcal: number;
  macronutrients: {
    carbohydratesGrams: number;
    proteinsGrams: number;
    totalFatGrams: number;
    fiberGrams: number;
  };
  mainMicronutrients: Record<string, number>;
  otherData: Record<string, number>;
}

export interface FoodTotals {
  totalCaloriesKcal: number;
  totalProteinGrams: number;
  totalCarbohydrateGrams: number;
  totalFatGrams: number;
  totalFiberGrams: number;
  totalMicronutrients: Record<string, number>;
}

export interface FoodEventData {
  inputText: string;
  items: FoodItem[];
  totals: FoodTotals;
  modelProvider: string;
  modelName: string;
  parsedAt: Date;
}

export class FoodEvent extends Event<FoodEventData> {
  private constructor(props: EventProps<FoodEventData>) {
    super(
      props.id ?? EventId.create(),
      "food",
      props.userId,
      props.name,
      props.description,
      props.startedAt,
      props.finishedAt,
      TagList.create(props.tags),
      props.interruptions,
      normalizeFoodEventData(props.data),
      props.missed,
      props.priority,
    );
  }

  static create(props: EventProps<FoodEventData>): FoodEvent {
    return new FoodEvent(props);
  }
}

function normalizeFoodEventData(data: FoodEventData): FoodEventData {
  return {
    ...data,
    items: data.items.map((item) => ({
      ...item,
      id: item.id ?? ulid(),
    })),
  };
}
