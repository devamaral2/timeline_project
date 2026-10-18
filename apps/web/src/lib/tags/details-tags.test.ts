import { expect, test } from "vitest";
import { joinDetailsAndTags, splitDetailsAndTags } from "./details-tags";

test("a hashtag on its own line becomes a tag and leaves the description", () => {
  expect(splitDetailsAndTags("Caminhada ao anoitecer\n#exercicios")).toEqual({ description: "Caminhada ao anoitecer", tags: ["exercicios"] });
});

test("inline and repeated hashtags are collected once, lowercased", () => {
  expect(splitDetailsAndTags("Ler #Livros hoje #livros #foco")).toEqual({ description: "Ler  hoje", tags: ["livros", "foco"] });
});

test("text without hashtags is kept", () => {
  expect(splitDetailsAndTags("Sem tags # aqui")).toEqual({ description: "Sem tags # aqui", tags: [] });
});

test("joining then splitting returns the same description and tags", () => {
  const joined = joinDetailsAndTags("Caminhada ao anoitecer", ["exercicios", "saude"]);
  expect(joined).toBe("Caminhada ao anoitecer\n#exercicios #saude");
  expect(splitDetailsAndTags(joined)).toEqual({ description: "Caminhada ao anoitecer", tags: ["exercicios", "saude"] });
  expect(joinDetailsAndTags("", [])).toBe("");
});
