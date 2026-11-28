import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";
import { MOTION_SCALE, motion, motionDesign, motionMs } from "./motion";

// Como no teste do Color.kt: o vitest roda da raiz do repositório.
const repositoryRoot = process.cwd();

function filesUnder(directory: string, extension: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return path.includes(`${join("app", "mockups")}`) ? [] : filesUnder(path, extension);
    return path.endsWith(extension) ? [path] : [];
  });
}

describe("motion", () => {
  test("cada tempo compartilhado é o tempo de desenho na escala", () => {
    for (const [token, designMs] of Object.entries(motionDesign)) {
      expect(motion[token as keyof typeof motion]).toBe(Math.round(designMs * MOTION_SCALE));
    }
    expect(motionMs(300, 1)).toBe(300);
    expect(motionMs(137, 0.5)).toBe(69);
  });

  test("o motion.css do web e o Motion.kt do app estão em dia com motion.ts", () => {
    expect(() =>
      execFileSync("pnpm", ["exec", "tsx", "scripts/theme/generate-motion.ts", "--check"], {
        cwd: repositoryRoot,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  /**
   * Todo tempo de transição do CSS do web vem de um token ou passa por `--motion-scale`. Ficam de fora os laços
   * (`infinite`, e os atrasos de uma regra que tem laço) e as regras do movimento reduzido (`!important`).
   */
  test("o CSS do web não tem tempo de transição fora da escala", () => {
    const stray: string[] = [];
    for (const file of filesUnder(join(repositoryRoot, "apps/web/src"), ".css")) {
      if (file.endsWith("motion.css")) continue;
      const css = readFileSync(file, "utf8");
      for (const match of css.matchAll(/((?:transition|animation)(?:-duration|-delay)?\s*:\s*)([^;{}]*)/g)) {
        const [, , value = ""] = match;
        if (/infinite|!important/.test(value)) continue;
        const offset = match.index ?? 0;
        const rule = css.slice(css.lastIndexOf("{", offset), css.indexOf("}", offset));
        if (/infinite/.test(rule)) continue;
        // Tira o que já está na escala; o que sobrar com unidade de tempo (menos o zero) é um tempo solto.
        const rest = value
          .replace(/calc\([^;]*?var\(--motion-scale\)\)/g, "")
          .replace(/var\(--[\w-]+\)/g, "");
        const literal = rest.match(/(?<![\w.-])(\d*\.?\d+)m?s\b/g)?.filter((time) => Number.parseFloat(time) !== 0);
        if (literal?.length) stray.push(`${relative(repositoryRoot, file)}: ${value.trim()}`);
      }
    }
    expect(stray).toEqual([]);
  });

  /**
   * No app, um `tween`, `durationMillis` ou `delayMillis` com número solto precisa vir de `Motion`, estar num laço
   * (`infiniteRepeatable` na mesma linha) ou trazer o comentário `// fora da escala` na linha ou na de cima.
   */
  test("o Kotlin do app não tem tempo de transição fora da escala", () => {
    const stray: string[] = [];
    const sources = filesUnder(join(repositoryRoot, "apps/mobile/app/src/main"), ".kt");
    for (const file of sources) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (!/tween\(\s*\d|durationMillis\s*=\s*\d|delayMillis\s*=\s*\d/.test(line)) return;
        if (/infiniteRepeatable/.test(line)) return;
        if (/\/\/ fora da escala/.test(line) || /\/\/ fora da escala/.test(lines[index - 1] ?? "")) return;
        stray.push(`${relative(repositoryRoot, file)}:${index + 1}: ${line.trim()}`);
      });
    }
    expect(stray).toEqual([]);
  });
});
