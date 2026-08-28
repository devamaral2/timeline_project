import { Apple, Clock, Dumbbell, Moon, type LucideIcon } from "lucide-react";
import type { EventPriority, EventType } from "@repo/entities/contracts";

/**
 * Os glifos do board da identidade: relogio, maca, halter e lua.
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
 * rotulo do tipo, logo acima do nome.
 *
 * O icone entra direto sobre a superficie — sem quadradinho de fundo e sem aro
 * —, como no board da identidade. A cor e informacao; o desenho e que permanece
 * de linha.
 *
 * O terceiro lugar e a barra de duracao no rodape, que precisa da mesma cor
 * como fundo e nao como texto — dai o par de classes.
 */
export const typeStyles: Record<EventType, { text: string; bar: string }> = {
  routine: { text: "text-routine", bar: "bg-routine" },
  food: { text: "text-food", bar: "bg-food" },
  training: { text: "text-training", bar: "bg-training" },
  sleep: { text: "text-sleep", bar: "bg-sleep" },
};

export const legendTypes: EventType[] = ["routine", "food", "training", "sleep"];

/**
 * O unico rotulo de situacao que sobrou.
 *
 * O evento nao tem mais ciclo de vida: tem uma anotacao, que o usuario liga
 * para registrar o que perdeu. Nao existe o oposto dela — um evento sem a marca
 * nao ganha selo nenhum, porque "nao anotado" nao e uma situacao a mostrar.
 */
export const missedLabel = "Não realizado";

/** Vermelho, o token de falha — separado de `training` e `food`, que sao tipo. */
export const missedBadgeClass = "bg-destructive/15 text-destructive";

export const priorityLabels: Record<EventPriority, string> = {
  urgent: "Urgente",
  normal: "Normal",
  flexible: "Flexível",
};

export const priorities: EventPriority[] = ["urgent", "normal", "flexible"];
