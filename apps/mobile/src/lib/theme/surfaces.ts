import type { ViewStyle } from "react-native";
import type { Theme } from "@repo/theme";

/**
 * Os acabamentos do design system que o web resolve em uma classe e o React
 * Native nao tem: sombra de cartao e a superficie dos campos.
 *
 * No web isso e `shadow-card` e o `fieldSurface` do `field-styles.ts`. Aqui
 * vira estilo, e mora em um lugar so para que os tres formularios e os dois
 * cartoes nao saiam cada um de um jeito.
 */

/** A sombra discreta que separa o cartao do fundo. */
export function cardShadow(theme: Theme): ViewStyle {
  return {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: theme.scheme === "dark" ? 0.45 : 0.12,
    shadowRadius: 14,
    // O Android ignora as props de sombra e usa a elevacao.
    elevation: 4,
  };
}

/**
 * A superficie de um campo de formulario, com a borda e o raio do tema.
 *
 * O retorno e `satisfies ViewStyle`, e nao `: ViewStyle`, porque o campo tanto
 * e uma `View` (a caixa de chips do `TagInput`) quanto um `TextInput` — e um
 * `TextInput` pede `TextStyle`. Anotar o tipo apagaria o formato do objeto e
 * deixaria so `ViewStyle`, que o `expo-env.d.ts` aumenta com as props do
 * react-native-web: la `userSelect` e `string`, largo demais para o
 * `TextStyle`, e o campo deixava de compilar. Com `satisfies` as quatro
 * propriedades continuam conferidas e o formato literal serve aos dois.
 */
export function fieldSurface(theme: Theme) {
  return {
    borderWidth: 1,
    borderColor: theme.colors.input,
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.radii.lg,
  } satisfies ViewStyle;
}
