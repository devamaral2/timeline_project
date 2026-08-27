/**
 * Conversao de oklch para uma cor que o React Native entende.
 *
 * O design system nasceu no CSS, onde `oklch()` e nativo. O RN so aceita cores
 * no formato do CSS 2 (`#rrggbb`, `rgba(...)`), entao os mesmos tokens
 * precisam ser convertidos antes de virar estilo. A conversao acontece aqui, e
 * nao a mao, para que os valores em `tokens.ts` continuem sendo exatamente os
 * que estao no `globals.css` do web — um unico lugar para editar a paleta.
 *
 * O caminho e oklch -> oklab -> LMS -> sRGB linear -> sRGB com gama.
 * As matrizes sao as da especificacao do Bjorn Ottosson.
 */

export interface Oklch {
  /** Luminosidade percebida, 0 a 1. */
  lightness: number;
  /** Croma (saturacao), 0 a ~0.4 no gamut sRGB. */
  chroma: number;
  /** Matiz em graus, 0 a 360. */
  hue: number;
  /** Opacidade, 0 a 1. */
  alpha: number;
}

const OKLCH_PATTERN =
  /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i;

/** Le `oklch(L C H)` ou `oklch(L C H / A)`, com L e A aceitando porcentagem. */
export function parseOklch(value: string): Oklch {
  const match = OKLCH_PATTERN.exec(value.trim());
  if (!match) throw new Error(`Not an oklch color: ${value}`);

  const [, rawLightness, rawChroma, rawHue, rawAlpha] = match as unknown as [
    string,
    string,
    string,
    string,
    string | undefined,
  ];

  return {
    lightness: asRatio(rawLightness),
    chroma: Number(rawChroma),
    hue: Number(rawHue),
    alpha: rawAlpha === undefined ? 1 : asRatio(rawAlpha),
  };
}

/** `50%` vira 0.5; `0.5` continua 0.5. */
function asRatio(value: string): number {
  return value.endsWith("%") ? Number(value.slice(0, -1)) / 100 : Number(value);
}

/** Canais sRGB de 0 a 255, ja com gama aplicada. */
function toRgb({ lightness, chroma, hue }: Oklch): [number, number, number] {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);

  // Raizes cubicas dos cones LMS, no espaco oklab.
  const longCubeRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mediumCubeRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const shortCubeRoot = lightness - 0.0894841775 * a - 1.291485548 * b;

  const long = longCubeRoot ** 3;
  const medium = mediumCubeRoot ** 3;
  const short = shortCubeRoot ** 3;

  return [
    gammaEncode(4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short),
    gammaEncode(-1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short),
    gammaEncode(-0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short),
  ];
}

/**
 * Curva de transferencia do sRGB. O clamp em 0..1 acontece aqui porque oklch
 * cobre cores fora do gamut sRGB — todas as da paleta cabem, mas as tags sao
 * geradas por hash e algumas combinacoes de matiz estouram um canal.
 */
function gammaEncode(channel: number): number {
  const clamped = Math.min(1, Math.max(0, channel));
  const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}

/**
 * Cor pronta para o RN: `#rrggbb` quando opaca, `rgba(...)` quando nao. O RN
 * nao aceita `#rrggbbaa` em todas as props, entao o formato funcional e o
 * caminho seguro para os tokens com transparencia (bordas do tema escuro,
 * fundos de chip de tag).
 */
export function oklchToCss(value: string | Oklch): string {
  const color = typeof value === "string" ? parseOklch(value) : value;
  const [red, green, blue] = toRgb(color);

  if (color.alpha >= 1) {
    return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  }
  return `rgba(${red}, ${green}, ${blue}, ${Number(color.alpha.toFixed(3))})`;
}

/**
 * Aplica opacidade a uma cor ja resolvida. O CSS escreve isso como `bg-food/10`
 * e resolve na hora; no React Native a transparencia tem que vir dentro da
 * propria cor, entao os tokens do tema precisam ser transformados antes de
 * virar estilo.
 *
 * Aceita as duas formas que `oklchToCss` produz — `#rrggbb` e `rgba(...)` — e
 * multiplica o alfa que ja existir, para que `withAlpha(border, 0.5)` num tema
 * escuro (onde a borda ja e translucida) clareie em vez de opacificar.
 */
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const channels = [0, 2, 4].map((offset) =>
      Number.parseInt((hex[1] as string).slice(offset, offset + 2), 16),
    );
    return `rgba(${channels.join(", ")}, ${alpha})`;
  }

  const rgba = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(color);
  if (rgba) {
    const [, red, green, blue, existing] = rgba as unknown as [string, string, string, string, string];
    return `rgba(${red}, ${green}, ${blue}, ${Number((Number(existing) * alpha).toFixed(3))})`;
  }

  throw new Error(`Not a resolved theme color: ${color}`);
}
