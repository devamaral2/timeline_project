import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AREAS, RAIZ_DO_REPOSITORIO, areaDe, chaveDe, varrer, type Residuo } from "./varredura";

export const ARQUIVO_DA_LINHA_DE_BASE = join(RAIZ_DO_REPOSITORIO, "test/residuos/linha-de-base.txt");

export type EntradaDaLinhaDeBase = { area: string; arquivo: string; texto: string; chave: string };

/** Le o arquivo: linhas `#` sao comentario, `== area ==` abre secao, o resto e `arquivo<TAB>texto`. */
export function lerLinhaDeBase(conteudo = readFileSync(ARQUIVO_DA_LINHA_DE_BASE, "utf8")): EntradaDaLinhaDeBase[] {
  const entradas: EntradaDaLinhaDeBase[] = [];
  let area = "";
  for (const linha of conteudo.split("\n")) {
    if (linha === "" || linha.startsWith("#")) continue;
    const secao = /^== (.+) ==$/.exec(linha);
    if (secao) {
      area = secao[1];
      continue;
    }
    const tab = linha.indexOf("\t");
    if (tab < 0 || area === "") throw new Error(`Linha de base malformada: ${linha}`);
    const arquivo = linha.slice(0, tab);
    const texto = linha.slice(tab + 1);
    entradas.push({ area, arquivo, texto, chave: chaveDe(area, arquivo, texto) });
  }
  return entradas;
}

export function escreverLinhaDeBase(cabecalho: string, entradas: Pick<EntradaDaLinhaDeBase, "area" | "arquivo" | "texto">[]): void {
  const saida = [cabecalho.trimEnd(), ""];
  for (const area of AREAS) {
    const daArea = entradas.filter((e) => e.area === area);
    if (daArea.length === 0) continue;
    saida.push(`== ${area} ==`);
    for (const e of daArea) saida.push(`${e.arquivo}\t${e.texto.replace(/\t/g, " ")}`);
    saida.push("");
  }
  writeFileSync(ARQUIVO_DA_LINHA_DE_BASE, saida.join("\n"));
}

export type Comparacao = {
  /** Residuos que existem e nao estao na linha de base. */
  novos: (Residuo & { area: string })[];
  /** Entradas da linha de base que nao existem mais. */
  sumidos: EntradaDaLinhaDeBase[];
};

export function compararComALinhaDeBase(
  residuos: Residuo[] = varrer(),
  linhaDeBase: EntradaDaLinhaDeBase[] = lerLinhaDeBase(),
): Comparacao {
  const restante = new Map<string, EntradaDaLinhaDeBase[]>();
  for (const e of linhaDeBase) restante.set(e.chave, [...(restante.get(e.chave) ?? []), e]);
  const novos: Comparacao["novos"] = [];
  for (const r of residuos) {
    const area = areaDe(r);
    const fila = restante.get(chaveDe(area, r.arquivo, r.texto));
    if (fila?.length) fila.shift();
    else novos.push({ ...r, area });
  }
  const sumidos = [...restante.values()].flat();
  return { novos, sumidos };
}
