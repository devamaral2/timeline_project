/**
 * Encolhe a linha de base: tira as entradas que nao existem mais. Nunca
 * acrescenta nada. Uso (da raiz): `pnpm run residuos:encolher`.
 * Falha, sem escrever, se houver residuo novo fora da linha de base.
 */
import { readFileSync } from "node:fs";
import {
  ARQUIVO_DA_LINHA_DE_BASE,
  compararComALinhaDeBase,
  escreverLinhaDeBase,
  lerLinhaDeBase,
} from "./linha-de-base";

const conteudo = readFileSync(ARQUIVO_DA_LINHA_DE_BASE, "utf8");
const entradas = lerLinhaDeBase(conteudo);
const { novos, sumidos } = compararComALinhaDeBase(undefined, entradas);
if (novos.length > 0) {
  console.error(`Ha ${novos.length} residuo(s) novo(s) fora da linha de base; rode o teste de varredura e corrija.`);
  process.exit(1);
}
const cabecalho = conteudo.slice(0, conteudo.search(/^== /m));
const fora = new Set(sumidos);
escreverLinhaDeBase(cabecalho, entradas.filter((e) => !fora.has(e)));
console.log(`Linha de base encolhida: ${sumidos.length} entrada(s) removida(s).`);
