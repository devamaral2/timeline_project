/**
 * Fixture do tema: cada token de cor de `packages/theme` (todos os que o pacote declara, não só os que o gerador do
 * Kotlin conhece) e o `--faint` escuro do web, em ARGB como o `Color.kt` os escreve. O teste do app compara o que o
 * Kotlin tem com isto, então um token novo ou um valor trocado no pacote sem `generate:theme` acende o teste do mobile.
 */
import { darkTokens, lightTokens, type ThemeTokens } from "../../../packages/theme/src/tokens";
import { faintOf, toArgb } from "../generate-theme";

function palette(tokens: ThemeTokens, mode: "light" | "dark") {
  const colors: Record<string, string> = {};
  for (const [name, value] of Object.entries(tokens.colors)) colors[name] = toArgb(value);
  colors.faint = toArgb(faintOf(mode));
  return { colors, tagLightness: tokens.tag.lightness, tagChroma: tokens.tag.chroma };
}

export function themeFixtures() {
  return { "theme-tokens": { dark: palette(darkTokens, "dark"), light: palette(lightTokens, "light") } };
}
