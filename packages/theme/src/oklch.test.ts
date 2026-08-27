import { expect, test } from "vitest";
import { oklchToCss, parseOklch, withAlpha } from "./oklch";

test("converts the achromatic extremes", () => {
  expect(oklchToCss("oklch(1 0 0)")).toBe("#ffffff");
  expect(oklchToCss("oklch(0 0 0)")).toBe("#000000");
});

test("keeps a translucent color as rgba, the only alpha format RN accepts everywhere", () => {
  expect(oklchToCss("oklch(1 0 0 / 10%)")).toBe("rgba(255, 255, 255, 0.1)");
});

test("reads percentages and the optional alpha", () => {
  expect(parseOklch("oklch(50% 0.1 200)")).toEqual({
    lightness: 0.5,
    chroma: 0.1,
    hue: 200,
    alpha: 1,
  });
  expect(parseOklch("oklch(0.5 0.1 200 / 0.25)").alpha).toBe(0.25);
});

test("rejects anything that is not an oklch color", () => {
  expect(() => oklchToCss("#ffffff")).toThrow(/Not an oklch color/);
});

test("clamps hues that fall outside the sRGB gamut instead of emitting garbage", () => {
  // Croma alto em qualquer matiz estoura pelo menos um canal; o resultado ainda
  // precisa ser um hex valido.
  for (let hue = 0; hue < 360; hue += 15) {
    expect(oklchToCss({ lightness: 0.7, chroma: 0.4, hue, alpha: 1 })).toMatch(/^#[0-9a-f]{6}$/);
  }
});

test("adds opacity to a resolved color, in both formats it can have", () => {
  expect(withAlpha("#22c55e", 0.1)).toBe("rgba(34, 197, 94, 0.1)");
  // Tokens que ja tem alfa multiplicam, e nao substituem: a borda do tema
  // escuro e translucida, e `withAlpha(border, 0.5)` precisa clarear mais.
  expect(withAlpha("rgba(255, 255, 255, 0.1)", 0.5)).toBe("rgba(255, 255, 255, 0.05)");
});

test("refuses a color that is not one of the resolved formats", () => {
  expect(() => withAlpha("oklch(0.5 0.1 200)", 0.5)).toThrow(/Not a resolved theme color/);
});
