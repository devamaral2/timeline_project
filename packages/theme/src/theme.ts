import { oklchToCss } from "./oklch";
import { darkTokens, lightTokens, radii, type ColorTokens, type ThemeTokens } from "./tokens";

/** O tema com todas as cores ja no formato que o React Native aceita. */
export interface Theme {
  scheme: "light" | "dark";
  colors: ColorTokens;
  radii: typeof radii;
  /** Luminosidade e croma das cores de tag deste tema. */
  tag: ThemeTokens["tag"];
}

function resolve(tokens: ThemeTokens, scheme: "light" | "dark"): Theme {
  const colors = {} as ColorTokens;
  for (const [name, value] of Object.entries(tokens.colors)) {
    colors[name as keyof ColorTokens] = oklchToCss(value);
  }
  return { scheme, colors, radii, tag: tokens.tag };
}

export const lightTheme: Theme = resolve(lightTokens, "light");
export const darkTheme: Theme = resolve(darkTokens, "dark");

/**
 * O tema para o esquema de cor informado. Aceita string solta porque as
 * plataformas discordam do que dizer quando nao ha preferencia: o React Native
 * responde `"unspecified"`, o browser responde `null`. Qualquer coisa que nao
 * seja `"dark"` cai no tema claro.
 */
export function themeFor(scheme: string | null | undefined): Theme {
  return scheme === "dark" ? darkTheme : lightTheme;
}

/**
 * Deriva um matiz (0-359) estavel a partir do nome da tag, para que a mesma tag
 * receba sempre a mesma cor em toda a aplicacao sem precisar persistir nada no
 * backend. O hash precisa ser identico no web e no mobile — por isso ele vive
 * aqui, e nao em cada app.
 */
export function hueForTag(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return hash % 360;
}

export interface TagColors {
  /** Cor solida do texto e dos indicadores. */
  color: string;
  /** Fundo suave do chip. */
  backgroundColor: string;
}

/**
 * Cores de um chip de tag: a luminosidade e o croma vem do tema (os mesmos dos
 * tokens de tipo de evento), so o matiz muda. Assim qualquer tag, mesmo com cor
 * sorteada por hash, continua harmonica com o resto da UI.
 */
export function tagColors(name: string, theme: Theme): TagColors {
  const { lightness, chroma } = theme.tag;
  const hue = hueForTag(name);
  return {
    color: oklchToCss({ lightness, chroma, hue, alpha: 1 }),
    backgroundColor: oklchToCss({ lightness, chroma, hue, alpha: 0.14 }),
  };
}
