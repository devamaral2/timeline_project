"use client";

import { useSyncExternalStore } from "react";
import { secondsSnapshot, subscribeToSeconds } from "@repo/timeline";

/** O sentinel do servidor: qualquer instante real divergiria do cliente. */
const NOT_RUNNING_YET = 0;

/**
 * O instante atual, avancando de segundo em segundo — ou `null` enquanto a
 * pagina nao hidratou. O relogio em si vive em `@repo/timeline`, o mesmo que o
 * app mobile usa.
 *
 * O `null` nao e detalhe: o HTML do servidor e gerado num instante e hidratado
 * em outro, e um cronometro renderizado nos dois lugares sairia com dois
 * numeros diferentes — mismatch de hidratacao. Enquanto isso quem chama mostra
 * o que veio da API, e o contador entra assim que o cliente assume.
 */
export function useNow(): Date | null {
  const value = useSyncExternalStore(
    subscribeToSeconds,
    secondsSnapshot,
    () => NOT_RUNNING_YET,
  );
  return value === NOT_RUNNING_YET ? null : new Date(value);
}
