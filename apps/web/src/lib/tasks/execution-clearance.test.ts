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

/** O pé da tela do que fica fixo nele: uma propriedade só, com a medida da gaveta no desktop e no celular. */
test("o afastamento do pé da tela sobe a altura que a gaveta de execução cobre, no desktop e no celular", () => {
  const declarations = css("styles/globals.css").match(/--fixed-bottom-offset:[^;]*;/g) ?? [];
  expect(declarations).toHaveLength(2);
  for (const declaration of declarations) expect(declaration).toContain("var(--execution-clearance, 0px)");
});

test("a escolha de status da lista lê esse afastamento, sem repetir a medida", () => {
  const picker = css("components/tasks/task-glyphs.module.css").match(/\.statusPicker \{ --picker-bottom:[^;]*;/g) ?? [];
  expect(picker).toHaveLength(1);
  expect(picker[0]).toContain("var(--fixed-bottom-offset)");
  expect(css("components/tasks/task-glyphs.module.css")).not.toContain("--execution-clearance");
});
