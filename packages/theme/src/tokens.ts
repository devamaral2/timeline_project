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
 * A paleta e a do design system "Time Composure": fundo quase preto
 * azulado, roxo como cor primaria e ciano como acento. Os hexadecimais de
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
   * As cores de situacao do evento. Vivem separadas das cores de tipo porque
   * respondem a outra pergunta: `training` diz o que o evento e, `success` diz
   * como ele terminou. O verde e deliberadamente mais folha que o `training`,
   * que puxa para o azul — os dois aparecem no mesmo cartao, um no icone e o
   * outro na linha da borda, e precisam ser distinguiveis.
   *
   * `warning` carrega o matiz de `meal` pelo mesmo motivo que `brand` carrega o
   * de `primary`: a paleta so tem uma nota de ambar, e o papel aqui e outro.
   */
  warning: string;
  success: string;
  border: string;
  input: string;
  ring: string;
  /**
   * As duas pontas do gradiente da marca — roxo para ciano. Existem separadas
   * de `primary` e `routine`, que por acaso carregam os mesmos hexadecimais,
   * porque o papel e outro: aqui e identidade visual (logo, botao principal,
   * realces), la e semantica (acao primaria, tipo de evento).
   */
  brand: string;
  brandAccent: string;
  /**
   * Cores por tipo de item do evento — o mesmo vocabulario do dominio.
   *
   * `meal` chamava-se `food` enquanto o evento tinha um tipo so. O valor e o
   * mesmo ambar de sempre; o nome mudou porque o conceito pintado aqui e a
   * refeicao (`MealItem`), e `food` continua existindo como entidade de
   * catalogo — o alimento dentro dela.
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
 * O tema claro e a traducao da mesma identidade para superficies claras: os
 * mesmos matizes, escurecidos o suficiente para manter contraste sobre branco.
 * O produto abre no escuro (veja `apps/web/src/app/layout.tsx` e
 * `apps/mobile/src/lib/theme/use-theme.ts`) — esta paleta existe para que a
 * volta do modo claro seja so trocar o tema, e nao redesenhar tudo.
 */
export const lightTokens: ThemeTokens = {
  colors: {
    background: "oklch(0.977 0.005 275)", // #f6f7fb
    foreground: "oklch(0.206 0.023 268.9)", // #131722
    card: "oklch(1 0 0)", // #ffffff
    cardForeground: "oklch(0.206 0.023 268.9)", // #131722
    primary: "oklch(0.52 0.256 286.8)", // #6a33f0
    primaryForeground: "oklch(1 0 0)", // #ffffff
    secondary: "oklch(0.953 0.01 273.4)", // #edeff6
    secondaryForeground: "oklch(0.206 0.023 268.9)", // #131722
    muted: "oklch(0.953 0.01 273.4)", // #edeff6
    mutedForeground: "oklch(0.504 0.033 268)", // #5c6478
    accent: "oklch(0.934 0.015 270)", // #e5e9f4
    accentForeground: "oklch(0.206 0.023 268.9)", // #131722
    destructive: "oklch(0.581 0.208 13.6)", // #d92a55
    destructiveForeground: "oklch(1 0 0)", // #ffffff
    warning: "oklch(0.61 0.133 65.7)", // #b8700c
    success: "oklch(0.62 0.15 145)", // #409d48
    border: "oklch(0.923 0.014 272.7)", // #e2e5ef
    input: "oklch(0.923 0.014 272.7)", // #e2e5ef
    ring: "oklch(0.52 0.256 286.8)", // #6a33f0
    brand: "oklch(0.52 0.256 286.8)", // #6a33f0
    brandAccent: "oklch(0.593 0.1359 241.41)", // #0e86c7
    sleep: "oklch(0.52 0.256 286.8)", // #6a33f0
    training: "oklch(0.65 0.1313 167.6)", // #06a87f
    meal: "oklch(0.61 0.133 65.7)", // #b8700c
    routine: "oklch(0.593 0.1359 241.41)", // #0e86c7
  },
  tag: { lightness: 0.52, chroma: 0.15 },
};

/** O tema escuro — o que a identidade foi desenhada para ser. */
export const darkTokens: ThemeTokens = {
  colors: {
    background: "oklch(0.187 0.02 265.9)", // #0f131c
    foreground: "oklch(1 0 0)", // #ffffff
    card: "oklch(0.24 0.024 267)", // #1a1f2b
    cardForeground: "oklch(1 0 0)", // #ffffff
    primary: "oklch(0.579 0.247 288.2)", // #7c4dff
    primaryForeground: "oklch(1 0 0)", // #ffffff
    secondary: "oklch(0.285 0.028 264)", // #232a38
    secondaryForeground: "oklch(1 0 0)", // #ffffff
    muted: "oklch(0.285 0.028 264)", // #232a38
    mutedForeground: "oklch(0.704 0.038 264.3)", // #94a0b8
    accent: "oklch(0.3 0.03 262.8)", // #262e3d
    accentForeground: "oklch(1 0 0)", // #ffffff
    // Apoio 3 da paleta puxado do rosa para o vermelho: destrutivo precisa ler
    // como alerta, e o texto por cima e escuro para nao apagar no neon.
    destructive: "oklch(0.697 0.198 12.9)", // #ff5c7a
    destructiveForeground: "oklch(0.2 0.019 266)", // #12161f
    warning: "oklch(0.817 0.147 70.3)", // #ffb14a
    success: "oklch(0.8 0.17 145)", // #6fda75
    border: "oklch(1 0 0 / 8%)",
    input: "oklch(1 0 0 / 12%)",
    ring: "oklch(0.579 0.247 288.2)", // #7c4dff
    brand: "oklch(0.579 0.247 288.2)", // #7c4dff
    brandAccent: "oklch(0.789 0.1326 230.59)", // #4cc9ff
    sleep: "oklch(0.579 0.247 288.2)", // #7c4dff
    training: "oklch(0.773 0.148 169.6)", // #22d3a6
    meal: "oklch(0.817 0.147 70.3)", // #ffb14a
    routine: "oklch(0.789 0.1326 230.59)", // #4cc9ff
  },
  tag: { lightness: 0.78, chroma: 0.13 },
};

/** `--radius: 0.875rem` do globals.css, na unidade que o RN usa. */
export const RADIUS = 14;

/** A escala de raio do Tailwind derivada de `--radius`, em pixels. */
export const radii = {
  sm: RADIUS - 4,
  md: RADIUS - 2,
  lg: RADIUS,
  xl: RADIUS + 4,
  "2xl": RADIUS + 8,
  full: 999,
} as const;
