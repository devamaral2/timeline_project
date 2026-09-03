import {
  Apple,
  CircleDashed,
  Clock,
  Dumbbell,
  Moon,
  type LucideIcon,
} from "lucide-react-native";
import type { EventPriority, KnownEventItemType } from "@repo/entities/contracts";
import type { Theme } from "@repo/theme";

/**
 * Os mesmos icones e rotulos do web (`apps/web/src/components/events/event-visuals.ts`).
 * A diferenca e so o pacote: `lucide-react-native` desenha com react-native-svg
 * em vez de <svg>.
 */

/**
 * O traco fino do desenho. O padrao do lucide (2) engorda o icone e, sobre o
 * fundo escuro, ele para de parecer desenhado a linha.
 */
export const ICON_STROKE_WIDTH = 1.75;

/**
 * Como um tipo de item se apresenta no cartao: o glifo do board da identidade,
 * o rotulo em portugues e a cor — que aparece no icone, no rotulo do tipo e na
 * barra de duracao do rodape.
 *
 * A cor vem como nome de token, e nao resolvida: quem tem o tema na mao e o
 * componente. E o nome e uma chave de `ColorTokens`, escrita aqui — o tipo que
 * chegou pela rede nunca indexa o tema.
 */
export interface ItemTypeVisual {
  Icon: LucideIcon;
  label: string;
  colorToken: keyof Theme["colors"];
}

const knownVisuals: Record<KnownEventItemType, ItemTypeVisual> = {
  routine: { Icon: Clock, label: "Rotina", colorToken: "routine" },
  meal: { Icon: Apple, label: "Refeição", colorToken: "meal" },
  training: { Icon: Dumbbell, label: "Treino", colorToken: "training" },
  sleep: { Icon: Moon, label: "Sono", colorToken: "sleep" },
};

/**
 * O tipo que este frontend ainda nao conhece.
 *
 * O registro de itens do backend cresce sem pedir licenca ao app: um tipo novo
 * chega pela rede antes de existir codigo aqui — e o app de uma loja demora a
 * ser atualizado, entao isso vai acontecer. Ele entra em cinza, com o rotulo
 * generico: o cartao continua legivel, e a timeline nao cai por causa de um
 * `undefined` num mapa.
 */
const unknownVisual: ItemTypeVisual = {
  Icon: CircleDashed,
  label: "Evento",
  colorToken: "mutedForeground",
};

/**
 * O visual do item que da a cara ao evento — o principal, e so ele. Os itens
 * secundarios de um evento composto aparecem no detalhe; mudar o icone ou a cor
 * do cartao por causa deles trocaria a resposta a pergunta "o que e isto?".
 */
export function visualForItemType(type: string): ItemTypeVisual {
  return knownVisuals[type as KnownEventItemType] ?? unknownVisual;
}

/**
 * O unico rotulo de situacao que sobrou, igual ao do web
 * (`apps/web/src/components/events/event-visuals.ts`).
 *
 * O evento nao tem mais ciclo de vida: tem uma anotacao, que o usuario liga
 * para registrar o que perdeu. Nao existe o oposto dela — um evento sem a marca
 * nao ganha selo nenhum.
 */
export const missedLabel = "Não realizado";

/** Vermelho, o token de falha — separado de `training` e `meal`, que sao tipo. */
export function missedColor(theme: Theme): string {
  return theme.colors.destructive;
}

export const priorityLabels: Record<EventPriority, string> = {
  urgent: "Urgente",
  normal: "Normal",
  flexible: "Flexível",
};
