import type { CSSProperties } from "react";

/**
 * Deriva um matiz (0-359) estavel a partir do nome da tag, para que a mesma
 * tag sempre receba a mesma cor em toda a aplicacao sem precisar persistir
 * nada no backend.
 */
function hueForTag(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return hash % 360;
}

/**
 * Cor solida da tag (usada em pontos/indicadores), na mesma luminosidade e
 * croma dos tokens de cor por tipo de evento (--sleep, --training, --food,
 * --routine) — so o matiz varia, para que qualquer cor de tag permaneca
 * harmonica com o resto do design system.
 */
export function tagAccentStyle(name: string): CSSProperties {
  const hue = hueForTag(name);
  return {
    "--tag-hue": hue,
    color: "oklch(var(--tag-lightness) var(--tag-chroma) var(--tag-hue))",
  } as CSSProperties;
}

/** Estilo completo de chip: fundo suave da cor da tag + texto na cor solida. */
export function tagColorStyle(name: string): CSSProperties {
  const hue = hueForTag(name);
  return {
    "--tag-hue": hue,
    color: "oklch(var(--tag-lightness) var(--tag-chroma) var(--tag-hue))",
    backgroundColor: "oklch(var(--tag-lightness) var(--tag-chroma) var(--tag-hue) / 0.14)",
  } as CSSProperties;
}
