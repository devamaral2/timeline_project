/**
 * Os tokens de cor do design system, na mesma notacao oklch do
 * `apps/web/src/styles/globals.css`.
 *
 * Este arquivo e a fonte da verdade da paleta. O web continua lendo as suas
 * cores das custom properties do CSS — copiar valores a mao entre os dois
 * abriria espaco para divergencia, entao ha um teste em
 * `apps/web/src/styles/theme-tokens.test.ts` que le o globals.css e compara com
 * o que esta aqui.
 *
 * A paleta e a "Névoa e Noite" do design system Braid
 * (`design system/Névoa e Noite-html/`): a névoa e o chao claro; a noite, um
 * azul de ardosia quase preto. O verde-agua e sempre o ponto (`brand`), e a
 * acao principal e sempre o fio tinta (`primary`). Os hexadecimais de
 * referencia estao ao lado de cada token — o oklch e a conversao exata deles,
 * conferida pelo `oklchToCss` daqui.
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
  /**
   * As cores de situacao. Nao tem nota propria: `warning` e o ambar de `meal`
   * e `success` e o verde-agua de `brand`, como na Sintese — a paleta so tem
   * um ambar e um verde-agua, e o papel aqui e outro.
   */
  warning: string;
  success: string;
  border: string;
  input: string;
  ring: string;
  /**
   * O ponto da marca, em verde-agua: agora, hoje, foco. `brandAccent` e o
   * mesmo ponto em texto pequeno (no claro, mais escuro para dar contraste; no
   * escuro, o hover) e `brandSoft` e o fundo do que esta ativo. Existem
   * separadas de `primary`, que e o fio tinta da acao principal.
   */
  brand: string;
  brandAccent: string;
  brandSoft: string;
  /**
   * Os quatro fios da trança do simbolo, cada um numa cor solida (sem
   * gradiente): a placa (`strandTile`), a névoa, o destaque e a tinta.
   */
  strandTile: string;
  strandNevoa: string;
  strandDestaque: string;
  strandTinta: string;
  /**
   * Cores por tipo de item do evento — o mesmo vocabulario do dominio.
   *
   * `meal` chamava-se `food` enquanto o evento tinha um tipo so. O valor e o
   * mesmo ambar de sempre; o nome mudou porque o conceito pintado aqui e a
   * refeicao (`MealItem`), e `food` continua existindo como entidade de
   * catalogo — o alimento dentro dela.
   *
   * Os quatro tipos dividem a mesma luminosidade e o mesmo croma, variando so o
   * matiz — a mesma regra das tags. O verde-agua fica de fora: ele e da marca.
   */
  sleep: string;
  training: string;
  meal: string;
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

/**
 * Névoa, o tema claro. O app segue o esquema do sistema e, sem preferencia,
 * abre na Névoa (veja `apps/web/src/app/layout.tsx`).
 */
export const lightTokens: ThemeTokens = {
  colors: {
    background: "oklch(0.967 0.004 214.3)", // #f1f5f6
    foreground: "oklch(0.249 0.022 220.8)", // #152429
    card: "oklch(1 0 0)", // #ffffff
    cardForeground: "oklch(0.249 0.022 220.8)", // #152429
    primary: "oklch(0.341 0.038 220)", // #203d46
    primaryForeground: "oklch(1 0 0)", // #ffffff
    secondary: "oklch(0.941 0.009 222.1)", // #e5edf0
    secondaryForeground: "oklch(0.249 0.022 220.8)", // #152429
    muted: "oklch(0.941 0.009 222.1)", // #e5edf0
    mutedForeground: "oklch(0.512 0.024 220)", // #586a70
    accent: "oklch(0.919 0.011 226)", // #dde6ea
    accentForeground: "oklch(0.249 0.022 220.8)", // #152429
    destructive: "oklch(0.53 0.13 17.8)", // #aa474f
    destructiveForeground: "oklch(1 0 0)", // #ffffff
    warning: "oklch(0.53 0.1 72)", // #8f611e (= meal)
    success: "oklch(0.575 0.089 179.2)", // #2e8a7a (= brand)
    border: "oklch(0.909 0.012 217.5)", // #d9e3e6
    input: "oklch(0.826 0.019 222.2)", // #b9c9cf
    ring: "oklch(0.575 0.089 179.2)", // #2e8a7a
    brand: "oklch(0.575 0.089 179.2)", // #2e8a7a
    brandAccent: "oklch(0.5208 0.0853 180.1)", // #1e796b
    brandSoft: "oklch(0.955 0.02 185.5)", // #e2f5f2
    strandTile: "oklch(0.941 0.009 222.1)", // #e5edf0
    strandNevoa: "oklch(0.805 0.028 219.8)", // #acc4cc
    strandDestaque: "oklch(0.641 0.094 182.3)", // #3c9f91
    strandTinta: "oklch(0.341 0.038 220)", // #203d46
    sleep: "oklch(0.531 0.099 287.5)", // #6962a2
    training: "oklch(0.529 0.099 134.8)", // #52783b
    meal: "oklch(0.53 0.1 72)", // #8f611e
    routine: "oklch(0.529 0.0995 231.7)", // #19759b
  },
  tag: { lightness: 0.53, chroma: 0.09 },
};

/** Noite, o tema escuro. */
export const darkTokens: ThemeTokens = {
  colors: {
    background: "oklch(0.234 0.025 246.5)", // #141f29
    foreground: "oklch(0.955 0.009 205.9)", // #eaf2f3
    card: "oklch(0.283 0.025 244)", // #1f2b35
    cardForeground: "oklch(0.955 0.009 205.9)", // #eaf2f3
    primary: "oklch(0.955 0.009 205.9)", // #eaf2f3
    primaryForeground: "oklch(0.283 0.025 244)", // #1f2b35
    secondary: "oklch(0.33 0.024 243.7)", // #2b3741
    secondaryForeground: "oklch(0.955 0.009 205.9)", // #eaf2f3
    muted: "oklch(0.33 0.024 243.7)", // #2b3741
    mutedForeground: "oklch(0.741 0.025 223.8)", // #9bafb7
    accent: "oklch(0.361 0.023 243.6)", // #333f49
    accentForeground: "oklch(0.955 0.009 205.9)", // #eaf2f3
    // O texto por cima do destrutivo e a propria noite: o rosa e claro demais
    // para carregar branco.
    destructive: "oklch(0.8 0.111 17.7)", // #fda0a3
    destructiveForeground: "oklch(0.283 0.025 244)", // #1f2b35
    warning: "oklch(0.801 0.09 72.5)", // #e2b57c (= meal)
    success: "oklch(0.7421 0.1095 177.7)", // #4fc2ab (= brand)
    border: "oklch(0.369 0.023 245.9)", // #36414b
    input: "oklch(0.435 0.021 240.4)", // #47535c
    ring: "oklch(0.7421 0.1095 177.7)", // #4fc2ab
    brand: "oklch(0.7421 0.1095 177.7)", // #4fc2ab
    brandAccent: "oklch(0.8 0.099 179)", // #6fd3bf
    brandSoft: "oklch(0.369 0.045 188.8)", // #204744
    strandTile: "oklch(0.283 0.025 244)", // #1f2b35
    strandNevoa: "oklch(0.638 0.042 219.1)", // #6f929d
    strandDestaque: "oklch(0.7421 0.1095 177.7)", // #4fc2ab
    strandTinta: "oklch(0.955 0.009 205.9)", // #eaf2f3
    sleep: "oklch(0.8 0.09 287.8)", // #bab5f5
    training: "oklch(0.8 0.09 134.7)", // #a5cb90
    meal: "oklch(0.801 0.09 72.5)", // #e2b57c
    routine: "oklch(0.799 0.09 232.5)", // #80c8ee
  },
  tag: { lightness: 0.8, chroma: 0.08 },
};

/** `--radius: 0.875rem` do globals.css, em pixels: o raio do cartao. */
export const RADIUS = 14;

/**
 * A escala de raio da Sintese, em pixels: `xs` nas tags e selos, `sm` nos
 * botoes e campos, `lg` nos cartoes e `xl` nos paineis e dialogos. A pilula
 * (`full`) fica para escolhas.
 */
export const radii = {
  xs: 5,
  sm: 8,
  md: 10,
  lg: RADIUS,
  xl: 18,
  "2xl": 22,
  full: 999,
} as const;
