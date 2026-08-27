import { Clock, Dumbbell, Moon, Utensils, type LucideIcon } from "lucide-react-native";
import type { EventType } from "@repo/entities/contracts";
import { withAlpha, type Theme } from "@repo/theme";

/**
 * Os mesmos icones e rotulos do web (`apps/web/src/components/events/event-visuals.ts`).
 * A diferenca e so o pacote: `lucide-react-native` desenha com react-native-svg
 * em vez de <svg>.
 */
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

export const eventTypes: EventType[] = ["routine", "food", "training", "sleep"];

/**
 * Fundo suave da cor do tipo, para o quadradinho do icone. O web escreve
 * `bg-food/10`; no RN a transparencia precisa vir na propria cor.
 */
export function typeSurface(type: EventType, theme: Theme): string {
  return withAlpha(theme.colors[type], 0.1);
}
