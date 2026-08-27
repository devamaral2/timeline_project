import { mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";
import { QuietReporter } from "./test/quiet-reporter";

/**
 * Config usado por `npm run test:ai`.
 *
 * Herda tudo de `vitest.config.ts` e apenas troca a saida: nenhum cabecalho,
 * nenhuma lista de arquivos, nenhum log de teste. Verde imprime `Tests pass`;
 * vermelho imprime o primeiro teste quebrado e o total de falhas.
 */
export default mergeConfig(baseConfig, {
  test: {
    reporters: [new QuietReporter()],
    silent: true,
  },
});
