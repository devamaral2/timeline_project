import { HermesGlyph } from "./hermes-glyph";
import styles from "./hermes-mark.module.css";

/**
 * Os cinco estados do botão do Hermes: parado (a onda quieta), ouvindo (a onda
 * pulsa, com halo), pensando (cinco pontos, um por barra, acendendo em
 * sequência), concluiu (o check) e erro (o círculo na cor de falha, com a
 * exclamação).
 */
export type HermesState = "idle" | "listening" | "thinking" | "done" | "error";

const BAR_X = [3.4, 8.9, 14.4, 19.9, 25.4];

/** O círculo do Hermes num dos cinco estados. É só um sinal: quem fala do estado é o texto ao lado. */
export function HermesMark({ state = "idle", className }: { state?: HermesState; className?: string }) {
  return (
    <span className={`${styles.mark} ${className ?? ""}`} data-state={state} aria-hidden>
      {state === "idle" || state === "listening" ? <HermesGlyph /> : null}
      {state === "thinking" ? (
        <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden>
          {BAR_X.map((x) => <circle key={x} cx={x + 1.6} cy="16" r="2.1" />)}
        </svg>
      ) : null}
      {state === "done" ? (
        <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m8 16.5 5.5 5.5L24 10.5" /></svg>
      ) : null}
      {state === "error" ? (
        <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden><rect x="14.4" y="5" width="3.2" height="15" rx="1.6" /><circle cx="16" cy="25.4" r="2" /></svg>
      ) : null}
    </span>
  );
}
