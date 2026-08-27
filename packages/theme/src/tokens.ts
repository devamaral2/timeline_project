/**
 * Os tokens de cor do design system, na mesma notacao oklch do
 * `apps/web/src/styles/globals.css`.
 *
 * Este arquivo e a fonte da verdade da paleta. O web continua lendo as suas
 * cores das custom properties do CSS — copiar valores a mao entre os dois
 * abriria espaco para divergencia, entao ha um teste em
 * `apps/web/src/styles/theme-tokens.test.ts` que le o globals.css e compara com
 * o que esta aqui.
 */

/** Nomes dos tokens de cor, na ordem em que aparecem no globals.css. */
export interface ColorTokens {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  /** Cores por tipo de evento — o mesmo vocabulario do dominio. */
  sleep: string;
  training: string;
  food: string;
  routine: string;
}

/** Luminosidade e croma usados pelas cores de tag, que variam so no matiz. */
export interface TagPalette {
  lightness: number;
  chroma: number;
}

export interface ThemeTokens {
  colors: ColorTokens;
  tag: TagPalette;
}

export const lightTokens: ThemeTokens = {
  colors: {
    background: "oklch(0.984 0.003 247.858)",
    foreground: "oklch(0.208 0.042 265.755)",
    card: "oklch(1 0 0)",
    cardForeground: "oklch(0.208 0.042 265.755)",
    primary: "oklch(0.585 0.203 277.117)",
    primaryForeground: "oklch(0.984 0.003 247.858)",
    secondary: "oklch(0.968 0.007 247.896)",
    secondaryForeground: "oklch(0.208 0.042 265.755)",
    muted: "oklch(0.968 0.007 247.896)",
    mutedForeground: "oklch(0.554 0.046 257.417)",
    accent: "oklch(0.97 0.014 254.604)",
    accentForeground: "oklch(0.208 0.042 265.755)",
    destructive: "oklch(0.577 0.245 27.325)",
    destructiveForeground: "oklch(0.984 0.003 247.858)",
    border: "oklch(0.929 0.013 255.508)",
    input: "oklch(0.929 0.013 255.508)",
    ring: "oklch(0.585 0.203 277.117)",
    sleep: "oklch(0.585 0.203 277.117)",
    training: "oklch(0.705 0.187 47.604)",
    food: "oklch(0.723 0.192 149.579)",
    routine: "oklch(0.554 0.046 257.417)",
  },
  tag: { lightness: 0.55, chroma: 0.15 },
};

export const darkTokens: ThemeTokens = {
  colors: {
    background: "oklch(0.129 0.042 264.695)",
    foreground: "oklch(0.984 0.003 247.858)",
    card: "oklch(0.208 0.042 265.755)",
    cardForeground: "oklch(0.984 0.003 247.858)",
    primary: "oklch(0.65 0.19 277.117)",
    primaryForeground: "oklch(0.984 0.003 247.858)",
    secondary: "oklch(0.279 0.041 260.031)",
    secondaryForeground: "oklch(0.984 0.003 247.858)",
    muted: "oklch(0.279 0.041 260.031)",
    mutedForeground: "oklch(0.704 0.04 256.788)",
    accent: "oklch(0.279 0.041 260.031)",
    accentForeground: "oklch(0.984 0.003 247.858)",
    destructive: "oklch(0.704 0.191 22.216)",
    destructiveForeground: "oklch(0.984 0.003 247.858)",
    border: "oklch(1 0 0 / 10%)",
    input: "oklch(1 0 0 / 15%)",
    ring: "oklch(0.65 0.19 277.117)",
    sleep: "oklch(0.673 0.182 277.117)",
    training: "oklch(0.75 0.16 47.604)",
    food: "oklch(0.77 0.17 149.579)",
    routine: "oklch(0.704 0.04 256.788)",
  },
  tag: { lightness: 0.75, chroma: 0.14 },
};

/** `--radius: 0.75rem` do globals.css, na unidade que o RN usa. */
export const RADIUS = 12;

/** A escala de raio do Tailwind derivada de `--radius`, em pixels. */
export const radii = {
  sm: RADIUS - 4,
  md: RADIUS - 2,
  lg: RADIUS,
  xl: RADIUS + 4,
  "2xl": RADIUS + 8,
  full: 999,
} as const;
