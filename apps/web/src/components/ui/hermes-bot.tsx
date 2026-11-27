import { useEffect, useRef, useState } from "react";
import styles from "./hermes-bot.module.css";

/**
 * O robô do Hermes: o círculo parado do chat. Em repouso ele pisca; ao ouvir,
 * pensar, concluir ou falhar vira os símbolos de cada estado (a onda, os três
 * pontos que pulam, o ✓ e a exclamação). O tamanho vem de quem usa, pelo `font-size`
 * (52 px na barra inferior).
 */
export type HermesBotState = "idle" | "listening" | "thinking" | "done" | "error";

/**
 * O robô da barra acompanha o chat mesmo com o painel fechado: pensa enquanto a
 * IA responde e mostra o desfecho (✓ ou !) por um instante, voltando ao repouso.
 */
export function useHermesBotState({ pending, failed }: { pending: boolean; failed: boolean }): HermesBotState {
  const [state, setState] = useState<HermesBotState>("idle");
  const thinkingRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (pending) {
      thinkingRef.current = true;
      window.clearTimeout(timerRef.current);
      setState("thinking");
      return;
    }
    if (!thinkingRef.current) return;
    thinkingRef.current = false;
    setState(failed ? "error" : "done");
    timerRef.current = window.setTimeout(() => setState("idle"), failed ? 2600 : 2400);
  }, [pending, failed]);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  return state;
}

/**
 * `plain` tira o disco: o desenho fica solto, na cor do texto ao lado, sem o verde, o halo nem o vermelho do erro (a linha
 * de status do detalhe, canvas "Input do detalhe da entidade"). Os movimentos dos estados são os mesmos.
 */
export function HermesBot({ state = "idle", className, plain = false }: { state?: HermesBotState; className?: string; plain?: boolean }) {
  return (
    <span className={`${styles.bot} ${className ?? ""}`} data-state={state} data-plain={plain || undefined} aria-hidden>
      <svg viewBox="0 0 32 32" aria-hidden>
        <g data-p="all">
          <g data-p="ant">
            <path fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" d="M16 9.5V6" />
            <circle fill="currentColor" stroke="none" cx="16" cy="4.6" r="2" />
          </g>
          <rect data-p="shell" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" x="5.5" y="9.5" width="21" height="16" rx="5.5" />
          <path data-p="earL" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" d="M2.6 15.5v4" />
          <path data-p="earR" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" d="M29.4 15.5v4" />
          <circle data-p="eyeL" fill="currentColor" stroke="none" cx="12" cy="17.5" r="2.1" />
          <circle data-p="eyeR" fill="currentColor" stroke="none" cx="20" cy="17.5" r="2.1" />
          <rect data-p="w1" fill="currentColor" stroke="none" x="3.4" y="12" width="3.2" height="8" rx="1.6" />
          <rect data-p="w2" fill="currentColor" stroke="none" x="8.9" y="8" width="3.2" height="16" rx="1.6" />
          <rect data-p="w3" fill="currentColor" stroke="none" x="14.4" y="4" width="3.2" height="24" rx="1.6" />
          <rect data-p="w4" fill="currentColor" stroke="none" x="19.9" y="9" width="3.2" height="14" rx="1.6" />
          <rect data-p="w5" fill="currentColor" stroke="none" x="25.4" y="12" width="3.2" height="8" rx="1.6" />
          <circle data-p="d1" fill="currentColor" stroke="none" cx="7.04" cy="16" r="3.04" />
          <circle data-p="d2" fill="currentColor" stroke="none" cx="16" cy="16" r="3.04" />
          <circle data-p="d3" fill="currentColor" stroke="none" cx="24.96" cy="16" r="3.04" />
          <path data-p="check" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" d="m8 16.5 5.5 5.5L24 10.5" />
          <rect data-p="ex" fill="currentColor" stroke="none" x="14.4" y="5" width="3.2" height="15" rx="1.6" />
          <circle data-p="pt" fill="currentColor" stroke="none" cx="16" cy="25.4" r="2" />
        </g>
      </svg>
    </span>
  );
}
