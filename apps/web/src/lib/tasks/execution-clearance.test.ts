import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { clearanceOf } from "./execution-clearance";

test("a medida vai da borda de cima da gaveta até o pé da janela, e é zero sem gaveta", () => {
  expect(clearanceOf({ top: 600, height: 200 }, 800)).toBe(200);
  expect(clearanceOf({ top: 599.6, height: 200 }, 800)).toBe(200);
  expect(clearanceOf({ top: 0, height: 0 }, 800)).toBe(0);
  expect(clearanceOf({ top: 900, height: 40 }, 800)).toBe(0);
});

const sourceRoot = join(__dirname, "..", "..");
const css = (path: string) => readFileSync(join(sourceRoot, path), "utf8");

/** As regras do pé da tela da lista, com a cauda do celular separada. */
test.each([
  ["a escolha de status", "components/tasks/task-glyphs.module.css", /\.statusPicker \{ --picker-bottom:[^}]*\}/g],
  ["o aviso", "components/task-list/tasks.module.css", /\.toast \{[^}]*bottom:[^;]*;/g],
])("%s sobe a altura que a gaveta de execução cobre, no desktop e no celular", (_name, path, rule) => {
  const found = css(path).match(rule) ?? [];
  expect(found).toHaveLength(2);
  for (const declaration of found) expect(declaration).toContain("var(--execution-clearance, 0px)");
});
