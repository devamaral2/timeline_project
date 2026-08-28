import { expect, test } from "vitest";
import { darkTheme, lightTheme, tagColors, themeFor } from "./theme";

test("resolves the palette to the hex the browser computes for the same oklch", () => {
  // Conferidos contra o valor que o Chrome computa para as mesmas cores no
  // globals.css: se a matriz de conversao regredir, estes quebram primeiro.
  expect(lightTheme.colors.background).toBe("#f6f7fb");
  expect(lightTheme.colors.border).toBe("#e2e5ef");
  expect(darkTheme.colors.background).toBe("#0f131c");
  expect(darkTheme.colors.card).toBe("#1a1f2b");
  expect(darkTheme.colors.brand).toBe("#7c4dff");
  expect(darkTheme.colors.brandAccent).toBe("#4cc9ff");
  expect(darkTheme.colors.training).toBe("#22d3a6");
  expect(darkTheme.colors.food).toBe("#ffb14a");
});

test("keeps the translucent tokens of the dark theme translucent", () => {
  expect(darkTheme.colors.border).toBe("rgba(255, 255, 255, 0.08)");
  expect(darkTheme.colors.input).toBe("rgba(255, 255, 255, 0.12)");
});

test("falls back to the light theme for every scheme that is not dark", () => {
  // O React Native responde `"unspecified"` quando nao ha preferencia; o
  // browser responde `null`. Nenhum dos dois pode virar tema escuro.
  expect(themeFor("unspecified")).toBe(lightTheme);
  expect(themeFor(null)).toBe(lightTheme);
  expect(themeFor(undefined)).toBe(lightTheme);
  expect(themeFor("dark")).toBe(darkTheme);
});

test("gives the same tag the same color every time, and different tags different ones", () => {
  expect(tagColors("treino", lightTheme)).toEqual(tagColors("treino", lightTheme));
  expect(tagColors("treino", lightTheme).color).not.toBe(tagColors("estudo", lightTheme).color);
});

test("tags follow the lightness of the active theme", () => {
  expect(tagColors("treino", darkTheme).color).not.toBe(tagColors("treino", lightTheme).color);
});

test("the tag chip background is the tag color, softened", () => {
  const { color, backgroundColor } = tagColors("foco", lightTheme);
  const [red, green, blue] = [1, 3, 5].map((offset) =>
    Number.parseInt(color.slice(offset, offset + 2), 16),
  );
  expect(backgroundColor).toBe(`rgba(${red}, ${green}, ${blue}, 0.14)`);
});
