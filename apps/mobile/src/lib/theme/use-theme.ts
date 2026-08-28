import { darkTheme, type Theme } from "@repo/theme";

/**
 * A identidade do produto e escura, e o app abre nela — como no web, onde o
 * <html> ja vem com a classe `dark` fixa (`apps/web/src/app/layout.tsx`).
 *
 * Antes isto seguia o `useColorScheme` do sistema. Seguir significava metade
 * dos aparelhos abrindo numa UI que nao e a desenhada, entao o tema claro
 * continua em `@repo/theme` esperando uma opcao explicita de troca — e nao a
 * preferencia do sistema.
 *
 * Continua sendo um hook: o dia em que houver essa opcao, muda so aqui.
 */
export function useTheme(): Theme {
  return darkTheme;
}
