/**
 * Um relogio de um segundo, compartilhado por quem estiver contando tempo.
 *
 * E um `setInterval` so para a aplicacao inteira, e nao um por cronometro: numa
 * lista com varias tarefas em andamento, cada um com o seu proprio intervalo
 * acordaria em momentos diferentes e os segundos ficariam fora de sincronia
 * entre cartoes vizinhos. O intervalo nasce no primeiro assinante e morre com o
 * ultimo — sem nenhum cronometro na tela, nada fica batendo.
 *
 * Fica aqui, e nao em cada app, porque web e mobile precisam do mesmo relogio e
 * ele nao depende do DOM nem do React Native. O que sobra para cada app e uma
 * linha de `useSyncExternalStore` — o pacote nao conhece React.
 */
const subscribers = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let snapshot = Date.now();

/** Assina o relogio. Devolve a funcao que cancela a assinatura. */
export function subscribeToSeconds(notify: () => void): () => void {
  subscribers.add(notify);
  if (timer === undefined) {
    snapshot = Date.now();
    timer = setInterval(() => {
      snapshot = Date.now();
      for (const listener of subscribers) listener();
    }, 1000);
  }
  return () => {
    subscribers.delete(notify);
    if (subscribers.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/**
 * O instante do ultimo tique, em milissegundos.
 *
 * Estavel entre os tiques de proposito: `useSyncExternalStore` compara o
 * snapshot por identidade e entraria em laco infinito com um `Date.now()` novo
 * a cada leitura.
 */
export function secondsSnapshot(): number {
  return snapshot;
}
