import { HermesBot, type HermesBotState } from "./hermes-bot";
import styles from "./hermes-mark.module.css";

/**
 * Os cinco estados do Hermes: parado (o robô pisca), ouvindo (a onda, com
 * halo), pensando (cinco pontos), concluiu (o ✓) e erro (a exclamação).
 */
export type HermesState = HermesBotState;

/**
 * O robô do Hermes num dos cinco estados, no tamanho da linha de status
 * (28 px). É só um sinal: quem fala do estado é o texto ao lado.
 */
export function HermesMark({ state = "idle", className }: { state?: HermesState; className?: string }) {
  return (
    <span className={`${styles.mark} ${className ?? ""}`} data-hermes-mark="" aria-hidden>
      <HermesBot state={state} />
    </span>
  );
}
