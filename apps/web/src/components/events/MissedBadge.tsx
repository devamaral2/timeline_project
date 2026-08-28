import { cn } from "@/lib/utils";
import { missedBadgeClass, missedLabel } from "./event-visuals";

interface MissedBadgeProps {
  missed: boolean | undefined;
  className?: string;
}

/**
 * O selo de "nao realizado".
 *
 * E o unico selo de situacao do cartao, e ele so existe quando o usuario anotou
 * o evento como perdido. Sem anotacao nao ha selo: nao anotado nao e uma
 * situacao, e desenhar "Realizado" em tudo que sobrou seria afirmar uma coisa
 * que ninguem afirmou.
 *
 * Aceita `undefined` porque a resposta vem pela rede — um backend de outra
 * versao nao pode derrubar a timeline por causa de um campo que nao mandou.
 */
export function MissedBadge({ missed, className }: MissedBadgeProps) {
  if (!missed) return null;

  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-3 tracking-wide",
        missedBadgeClass,
        className,
      )}
    >
      {missedLabel}
    </span>
  );
}
