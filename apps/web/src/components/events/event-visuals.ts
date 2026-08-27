import { Clock, Dumbbell, Moon, Utensils, type LucideIcon } from "lucide-react";
import type { EventType } from "@repo/entities/contracts";

export const typeIcons: Record<EventType, LucideIcon> = {
  routine: Clock,
  food: Utensils,
  training: Dumbbell,
  sleep: Moon,
};

export const typeLabels: Record<EventType, string> = {
  routine: "Rotina",
  food: "Alimentação",
  training: "Treino",
  sleep: "Sono",
};

export const typeStyles: Record<EventType, { icon: string; iconBg: string; bar: string }> = {
  routine: { icon: "text-routine", iconBg: "bg-routine/10", bar: "bg-routine" },
  food: { icon: "text-food", iconBg: "bg-food/10", bar: "bg-food" },
  training: { icon: "text-training", iconBg: "bg-training/10", bar: "bg-training" },
  sleep: { icon: "text-sleep", iconBg: "bg-sleep/10", bar: "bg-sleep" },
};

export const legendTypes: EventType[] = ["routine", "food", "training", "sleep"];
