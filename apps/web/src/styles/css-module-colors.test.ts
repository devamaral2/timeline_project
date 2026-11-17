import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

/**
 * As cores vivem no globals.css (e em `@repo/theme`); um CSS module so aponta
 * para elas com `var(--token)` ou as mistura com `color-mix`. Um hexadecimal ou
 * um `rgb()` solto num modulo e uma cor que nao troca entre Névoa e Noite e que
 * o app Android nunca vai enxergar — foi assim que "concluida" virou roxo numa
 * tela e verde em outra.
 */
const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function cssModules(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return cssModules(path);
    return entry.name.endsWith(".module.css") ? [path] : [];
  });
}

/** `mask-image` usa preto e transparente como alfa, nao como cor de tela. */
function withoutMasks(css: string): string {
  return css.replace(/mask(-image)?:[^;]+;/g, "");
}

test("CSS modules take every color from the design tokens", () => {
  const offenders = cssModules(sourceRoot).flatMap((path) => {
    const css = withoutMasks(readFileSync(path, "utf8"));
    const literals = css.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi) ?? [];
    return literals.map((literal) => `${relative(sourceRoot, path)}: ${literal}`);
  });

  expect(offenders).toEqual([]);
});
