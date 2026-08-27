import { useColorScheme } from "react-native";
import { themeFor, type Theme } from "@repo/theme";

/**
 * O tema segue o modo claro/escuro do sistema, como no web (onde quem decide e
 * a classe `.dark` no html). As cores sao as mesmas: `@repo/theme` resolve os
 * tokens oklch do design system para o formato que o RN aceita.
 */
export function useTheme(): Theme {
  return themeFor(useColorScheme());
}
