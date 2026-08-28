import { Apple, Clock, Dumbbell, Moon, type LucideIcon } from "lucide-react-native";
import type { EventPriority, EventType } from "@repo/entities/contracts";
import type { Theme } from "@repo/theme";

/**
 * Os mesmos icones e rotulos do web (`apps/web/src/components/events/event-visuals.ts`).
 * A diferenca e so o pacote: `lucide-react-native` desenha com react-native-svg
 * em vez de <svg>.
 */
export const typeIcons: Record<EventType, LucideIcon> = {
  routine: Clock,
  food: Apple,
  training: Dumbbell,
  sleep: Moon,
};

/**
 * O traco fino do desenho. O padrao do lucide (2) engorda o icone e, sobre o
 * fundo escuro, ele para de parecer desenhado a linha.
 */
export const ICON_STROKE_WIDTH = 1.75;

export const typeLabels: Record<EventType, string> = {
  routine: "Rotina",
  food: "Alimentação",
  training: "Treino",
  sleep: "Sono",
};

/**
 * Cada tipo tem a sua cor, e ela aparece em dois lugares do cartao: o icone e o
 * rotulo do tipo. E o mesmo mapa do web (`typeStyles`), aqui resolvido em cor
 * e nao em classe.
 *
 * O icone continua entrando direto sobre a superficie — sem quadradinho de
 * fundo e sem aro —, como no board da identidade.
 */
export function eventAccent(theme: Theme, type: EventType): string {
  return theme.colors[type];
}

export const eventTypes: EventType[] = ["routine", "food", "training", "sleep"];

/**
 * O unico rotulo de situacao que sobrou, igual ao do web
 * (`apps/web/src/components/events/event-visuals.ts`).
 *
 * O evento nao tem mais ciclo de vida: tem uma anotacao, que o usuario liga
 * para registrar o que perdeu. Nao existe o oposto dela — um evento sem a marca
 * nao ganha selo nenhum.
 */
export const missedLabel = "Não realizado";

/** Vermelho, o token de falha — separado de `training` e `food`, que sao tipo. */
export function missedColor(theme: Theme): string {
  return theme.colors.destructive;
}

export const priorityLabels: Record<EventPriority, string> = {
  urgent: "Urgente",
  normal: "Normal",
  flexible: "Flexível",
};
