import { Apple, CalendarCheck, CircleDashed, Dumbbell, Moon, type LucideIcon } from "lucide-react";
import type { HumanTaskKind, NotificationOffsetMinutes } from "@repo/contracts";

/**
 * O traco fino do desenho. O padrao do lucide (2) engorda o icone e, sobre o
 * fundo escuro, ele para de parecer desenhado a linha.
 */
export const ICON_STROKE_WIDTH = 1.75;

/**
 * Como um tipo de tarefa se apresenta no cartao: o glifo do board da identidade
 * e o rotulo em portugues. O tipo nao tem cor — so o icone o distingue.
 */
export interface ItemTypeVisual {
  Icon: LucideIcon;
  label: string;
}

const knownVisuals: Record<HumanTaskKind, ItemTypeVisual> = {
  common: { Icon: CalendarCheck, label: "Padrão" },
  meal: { Icon: Apple, label: "Refeição" },
  training: { Icon: Dumbbell, label: "Treino" },
  sleep: { Icon: Moon, label: "Sono" },
};

/**
 * O tipo que este frontend ainda nao conhece.
 *
 * As naturezas de tarefa do backend crescem sem pedir licenca ao web: uma nova
 * chega pela rede antes de existir codigo aqui. Ele entra com o icone
 * generico e o rotulo generico — o cartao continua legivel, e a timeline nao cai por causa
 * de um `undefined` num mapa.
 */
const unknownVisual: ItemTypeVisual = {
  Icon: CircleDashed,
  label: "Tarefa",
};

/**
 * O visual da natureza da tarefa (`kind`) — e so ela. As notes de uma tarefa
 * aparecem no detalhe; mudar o icone ou a cor do cartao por causa delas trocaria
 * a resposta a pergunta "o que e isto?".
 */
export function visualForItemType(type: string): ItemTypeVisual {
  return knownVisuals[type as HumanTaskKind] ?? unknownVisual;
}

/** As naturezas que o formulario de criacao oferece. */
export const creatableItemTypes: HumanTaskKind[] = ["common", "meal", "training", "sleep"];

/**
 * O unico rotulo de situacao que sobrou.
 *
 * A tarefa nao tem ciclo de vida: tem uma anotacao, que o usuario liga para
 * registrar o que perdeu. Nao existe o oposto dela — uma tarefa sem a marca nao
 * ganha selo nenhum, porque "nao anotado" nao e uma situacao a mostrar.
 */
export const missedLabel = "Não realizado";

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
