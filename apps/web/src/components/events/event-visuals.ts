import { Apple, CircleDashed, Clock, Dumbbell, Moon, type LucideIcon } from "lucide-react";
import type { EventKind, EventPriority, NotificationOffsetMinutes } from "@/lib/api/contracts";

/**
 * O traco fino do desenho. O padrao do lucide (2) engorda o icone e, sobre o
 * fundo escuro, ele para de parecer desenhado a linha.
 */
export const ICON_STROKE_WIDTH = 1.75;

/**
 * Como um tipo de evento se apresenta no cartao: o glifo do board da identidade,
 * o rotulo em portugues e a cor — que aparece no icone, no rotulo e, como
 * fundo, na barra de duracao do rodape. Dai o par de classes.
 */
export interface ItemTypeVisual {
  Icon: LucideIcon;
  label: string;
  text: string;
  bar: string;
}

const knownVisuals: Record<EventKind, ItemTypeVisual> = {
  routine: { Icon: Clock, label: "Rotina", text: "text-routine", bar: "bg-routine" },
  meal: { Icon: Apple, label: "Refeição", text: "text-meal", bar: "bg-meal" },
  training: { Icon: Dumbbell, label: "Treino", text: "text-training", bar: "bg-training" },
  sleep: { Icon: Moon, label: "Sono", text: "text-sleep", bar: "bg-sleep" },
};

/**
 * O tipo que este frontend ainda nao conhece.
 *
 * As naturezas de evento do backend crescem sem pedir licenca ao web: uma nova
 * chega pela rede antes de existir codigo aqui. Ele entra em cinza, com o
 * rotulo generico — o cartao continua legivel, e a timeline nao cai por causa
 * de um `undefined` num mapa.
 */
const unknownVisual: ItemTypeVisual = {
  Icon: CircleDashed,
  label: "Evento",
  text: "text-muted-foreground",
  bar: "bg-muted-foreground",
};

/**
 * O visual da natureza do evento (`kind`) — e so ela. As notes de um evento
 * aparecem no detalhe; mudar o icone ou a cor do cartao por causa delas trocaria
 * a resposta a pergunta "o que e isto?".
 */
export function visualForItemType(type: string): ItemTypeVisual {
  return knownVisuals[type as EventKind] ?? unknownVisual;
}

/** As naturezas que o formulario de criacao oferece. */
export const creatableItemTypes: EventKind[] = ["routine", "meal", "training", "sleep"];

/**
 * O unico rotulo de situacao que sobrou.
 *
 * O evento nao tem ciclo de vida: tem uma anotacao, que o usuario liga para
 * registrar o que perdeu. Nao existe o oposto dela — um evento sem a marca nao
 * ganha selo nenhum, porque "nao anotado" nao e uma situacao a mostrar.
 */
export const missedLabel = "Não realizado";

/** Vermelho, o token de falha — separado de `training` e `meal`, que sao tipo. */
export const missedBadgeClass = "bg-destructive/15 text-destructive";

export const priorityLabels: Record<EventPriority, string> = {
  urgent: "Urgente",
  normal: "Normal",
  flexible: "Flexível",
};

export const priorities: EventPriority[] = ["urgent", "normal", "flexible"];

const MINUTES_PER_DAY = 1440;

/**
 * Numero livre, nao lista fixa: o usuario digita a quantidade e escolhe a
 * unidade (minutos ou dias) na interface, e os dois convertem para minutos
 * antes de chegar aqui. Um valor exatamente divisivel por um dia mostra a
 * unidade maior — 1440 vira "1 dia antes", nao "1440 minutos antes".
 */
export function notificationOffsetLabel(minutes: NotificationOffsetMinutes): string {
  if (minutes % MINUTES_PER_DAY === 0) {
    const days = minutes / MINUTES_PER_DAY;
    return `${days} ${days === 1 ? "dia" : "dias"} antes`;
  }
  return `${minutes} ${minutes === 1 ? "minuto" : "minutos"} antes`;
}
