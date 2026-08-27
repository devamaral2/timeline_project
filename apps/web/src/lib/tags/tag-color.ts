import type { CSSProperties } from "react";
import { hueForTag } from "@repo/theme";

/**
 * O matiz de cada tag vem de `@repo/theme` para que web e mobile pintem a mesma
 * tag da mesma cor — o hash precisa ser identico nos dois.
 *
 * Aqui as cores ficam em oklch, montadas com as custom properties do tema
 * (`--tag-lightness`, `--tag-chroma`, definidas no globals.css). No mobile o
 * mesmo pacote resolve para hex, porque o RN nao entende oklch.
 */

/**
 * Cor solida da tag (usada em pontos/indicadores), na mesma luminosidade e
 * croma dos tokens de cor por tipo de evento (--sleep, --training, --food,
 * --routine) — so o matiz varia, para que qualquer cor de tag permaneca
 * harmonica com o resto do design system.
 */
export function tagAccentStyle(name: string): CSSProperties {
  return {
    "--tag-hue": hueForTag(name),
    color: "oklch(var(--tag-lightness) var(--tag-chroma) var(--tag-hue))",
  } as CSSProperties;
}

/** Estilo completo de chip: fundo suave da cor da tag + texto na cor solida. */
export function tagColorStyle(name: string): CSSProperties {
  return {
    "--tag-hue": hueForTag(name),
    color: "oklch(var(--tag-lightness) var(--tag-chroma) var(--tag-hue))",
    backgroundColor: "oklch(var(--tag-lightness) var(--tag-chroma) var(--tag-hue) / 0.14)",
  } as CSSProperties;
}
