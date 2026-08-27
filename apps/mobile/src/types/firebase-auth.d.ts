import type { Persistence } from "firebase/auth";

/**
 * O pacote `firebase/auth` publica dois builds: o do browser e o do React
 * Native. O Metro carrega o segundo, pela condicao de exportacao
 * `react-native` — mas o TypeScript nao: a condicao `types` vem antes dela no
 * package.json do `@firebase/auth` e vence a resolucao, entao o compilador so
 * enxerga a API do browser.
 *
 * O resultado e que `getReactNativePersistence` existe em tempo de execucao e
 * nao existe para o compilador. A declaracao abaixo cobre so essa diferenca; se
 * um dia o pacote inverter a ordem das condicoes, este arquivo pode sair.
 */
declare module "firebase/auth" {
  /** O contrato que o SDK espera do AsyncStorage — um subconjunto do que ele expoe. */
  export interface ReactNativeAsyncStorage {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
  }

  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
