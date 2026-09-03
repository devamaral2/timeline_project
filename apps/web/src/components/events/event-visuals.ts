import { Apple, CircleDashed, Clock, Dumbbell, Moon, type LucideIcon } from "lucide-react";
import type { EventPriority, KnownEventItemType } from "@repo/entities/contracts";

/**
 * O traco fino do desenho. O padrao do lucide (2) engorda o icone e, sobre o
 * fundo escuro, ele para de parecer desenhado a linha.
 */
export const ICON_STROKE_WIDTH = 1.75;

/**
 * Como um tipo de item se apresenta no cartao: o glifo do board da identidade,
 * o rotulo em portugues e a cor — que aparece no icone, no rotulo e, como
 * fundo, na barra de duracao do rodape. Dai o par de classes.
 */
export interface ItemTypeVisual {
  Icon: LucideIcon;
  label: string;
  text: string;
  bar: string;
}

const knownVisuals: Record<KnownEventItemType, ItemTypeVisual> = {
  routine: { Icon: Clock, label: "Rotina", text: "text-routine", bar: "bg-routine" },
  meal: { Icon: Apple, label: "Refeição", text: "text-meal", bar: "bg-meal" },
  training: { Icon: Dumbbell, label: "Treino", text: "text-training", bar: "bg-training" },
  sleep: { Icon: Moon, label: "Sono", text: "text-sleep", bar: "bg-sleep" },
};

/**
 * O tipo que este frontend ainda nao conhece.
 *
 * O registro de itens do backend cresce sem pedir licenca ao web: um tipo novo
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
 * O visual do item que da a cara ao evento — o principal, e so ele. Os itens
 * secundarios de um evento composto aparecem no detalhe; mudar o icone ou a cor
 * do cartao por causa deles trocaria a resposta a pergunta "o que e isto?".
 */
export function visualForItemType(type: string): ItemTypeVisual {
  return knownVisuals[type as KnownEventItemType] ?? unknownVisual;
}

/** Os tipos que o formulario de criacao oferece. */
export const creatableItemTypes: KnownEventItemType[] = ["routine", "meal", "training", "sleep"];

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
