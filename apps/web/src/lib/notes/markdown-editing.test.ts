import { expect, test } from "vitest";
import { continueMarkdownList, toggleWrap } from "./markdown-editing";

const atEnd = (value: string) => continueMarkdownList(value, value.length, value.length);

test("Enter continua uma lista com o mesmo marcador", () => {
  expect(atEnd("- Arroz")).toMatchObject({ value: "- Arroz\n- ", selectionStart: 10 });
  expect(atEnd("* Arroz")?.value).toBe("* Arroz\n* ");
  expect(atEnd("  - Arroz")?.value).toBe("  - Arroz\n  - ");
});

test("Enter numera o próximo item, abre tarefa desmarcada e repete a citação", () => {
  expect(atEnd("1. Um\n2. Dois")?.value).toBe("1. Um\n2. Dois\n3. ");
  expect(atEnd("- [x] Feito")?.value).toBe("- [x] Feito\n- [ ] ");
  expect(atEnd("> Citação")?.value).toBe("> Citação\n> ");
});

test("Enter em um item vazio encerra a lista", () => {
  expect(atEnd("- Arroz\n- ")).toMatchObject({ value: "- Arroz\n", selectionStart: 8 });
  expect(atEnd("1. ")?.value).toBe("");
});

test("Enter no meio de um item leva o resto do texto para o próximo", () => {
  expect(continueMarkdownList("- Arroz integral", 7, 7)?.value).toBe("- Arroz\n-  integral");
});

test("Enter fora de lista, no marcador ou com seleção segue o caminho normal", () => {
  expect(atEnd("Texto solto")).toBeNull();
  expect(atEnd("**negrito**")).toBeNull();
  expect(continueMarkdownList("- Arroz", 1, 1)).toBeNull();
  expect(continueMarkdownList("- Arroz", 2, 5)).toBeNull();
});

test("envolve a seleção e desfaz ao repetir", () => {
  const wrapped = toggleWrap("um dois três", 3, 7, "**");
  expect(wrapped).toEqual({ value: "um **dois** três", selectionStart: 5, selectionEnd: 9 });
  expect(toggleWrap(wrapped.value, wrapped.selectionStart, wrapped.selectionEnd, "**")).toEqual({
    value: "um dois três",
    selectionStart: 3,
    selectionEnd: 7,
  });
});

test("sem seleção, deixa o cursor entre as marcas", () => {
  expect(toggleWrap("ab", 1, 1, "*")).toEqual({ value: "a**b", selectionStart: 2, selectionEnd: 2 });
});
