import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { darkTokens, lightTokens, RADIUS, type ThemeTokens } from "@repo/theme";

// O caminho e montado com `node:path`, e nao com `new URL("./globals.css",
// import.meta.url)`: sob jsdom o `URL` global resolve relativos contra a base do
// documento (http://localhost:3000), nao contra a base passada.
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "globals.css"), "utf8");

/**
 * A paleta e declarada duas vezes: em custom properties aqui no globals.css,
 * que e como o Tailwind a consome, e em `@repo/theme`, que e como o app mobile
 * a consome (o React Native nao entende oklch nem var()). Estes testes travam
 * as duas juntas — sem eles, mudar uma cor no web deixaria o mobile para tras.
 */

/** As declaracoes `--nome: valor;` do primeiro bloco daquele seletor. */
function customPropertiesOf(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Selector not found in globals.css: ${selector}`);
  const block = css.slice(start, css.indexOf("}", start));

  const properties = new Map<string, string>();
  for (const [, name, value] of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    properties.set(name as string, (value as string).trim());
  }
  return properties;
}

/** `cardForeground` -> `--card-foreground` */
function cssName(token: string): string {
  return `--${token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function expectMatchingTokens(selector: string, tokens: ThemeTokens): void {
  const properties = customPropertiesOf(selector);

  for (const [token, value] of Object.entries(tokens.colors)) {
    expect(properties.get(cssName(token)), `${selector} ${cssName(token)}`).toBe(value);
  }
  expect(Number(properties.get("--tag-lightness"))).toBe(tokens.tag.lightness);
  expect(Number(properties.get("--tag-chroma"))).toBe(tokens.tag.chroma);
}

test("the light palette in globals.css matches @repo/theme", () => {
  expectMatchingTokens(":root", lightTokens);
});

test("the dark palette in globals.css matches @repo/theme", () => {
  expectMatchingTokens(".dark", darkTokens);
});

test("the color of a meal is declared as meal, and food no longer names a color", () => {
  // `food` era o nome enquanto o evento tinha um tipo so. O ambar continua o
  // mesmo; quem ele pinta agora e a refeicao. Um `--food` esquecido no CSS
  // seria um utilitario `text-food` que o Tailwind ainda geraria e ninguem
  // mais alimentaria.
  expect(customPropertiesOf(".dark").get("--meal")).toBe(darkTokens.colors.meal);
  expect(css).not.toContain("--food");
});

test("the radius in globals.css matches the one the mobile app uses", () => {
  const radius = customPropertiesOf(":root").get("--radius");
  expect(radius).toBe(`${RADIUS / 16}rem`);
});
