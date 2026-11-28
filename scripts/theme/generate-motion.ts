import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MOTION_SCALE, type MotionToken, motion, motionDesign } from "../../packages/theme/src/motion";

/**
 * Escreve os tempos de `packages/theme/src/motion.ts` nos dois lados: as custom properties do web
 * (`apps/web/src/styles/motion.css`, importado pelo `globals.css`) e o `Motion` do app Android. Com `--check`, só
 * confere que os dois arquivos estão em dia (o teste de `packages/theme` roda assim).
 */

const at = (path: string) => resolve(fileURLToPath(new URL(path, import.meta.url)));

export const generatedMotionCssPath = at("../../apps/web/src/styles/motion.css");
export const generatedMotionKotlinPath = at(
  "../../apps/mobile/app/src/main/java/app/braid/mobile/core/designsystem/Motion.kt",
);

const SOURCE = "packages/theme/src/motion.ts";
const COMMAND = "pnpm generate:motion";

const kebab = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const screaming = (name: string) => name.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase();

/** `durationFast` → `--duration-fast` e `stagger` → `--stagger`, os nomes que o web já usava; o resto, `--motion-*`. */
export function cssPropertyOf(token: MotionToken): string {
  return token.startsWith("duration") || token === "stagger" ? `--${kebab(token)}` : `--motion-${kebab(token)}`;
}

/** `flightOut` → `FLIGHT_OUT_MS`. */
export function kotlinConstantOf(token: MotionToken): string {
  return `${screaming(token)}_MS`;
}

const tokens = Object.keys(motionDesign) as MotionToken[];

export function renderMotionCss(): string {
  const properties = tokens.map((token) => `  ${cssPropertyOf(token)}: ${motion[token]}ms;`).join("\n");
  return `/* GERADO por scripts/theme/generate-motion.ts — não edite; rode \`${COMMAND}\`.
   A fonte da verdade está em ${SOURCE}: os tempos de desenho e a escala única do movimento.
   O que só existe no web passa pela mesma escala: \`calc(300ms * var(--motion-scale))\`. */
:root {
  --motion-scale: ${MOTION_SCALE};
${properties}
}
`;
}

export function renderMotionKotlin(): string {
  const constants = tokens
    .map((token) => `    /** ${motionDesign[token]} ms no desenho. */\n    const val ${kotlinConstantOf(token)} = ${motion[token]}`)
    .join("\n\n");
  return `// GERADO por scripts/theme/generate-motion.ts — não edite; rode \`${COMMAND}\`.
// A fonte da verdade está em ${SOURCE}.

package app.braid.mobile.core.designsystem

import kotlin.math.roundToInt

/**
 * Os tempos das animações de transição, os mesmos do web. [SCALE] multiplica todos: o que só existe no app escreve
 * o tempo de desenho e o passa por [ms]; uma mola passa a rigidez de desenho por [stiffness]. Laços e o movimento
 * reduzido ficam fora da escala.
 */
object Motion {
    /** O multiplicador único do tempo das transições: 1 é o tempo dos canvases. */
    const val SCALE = ${Number.isInteger(MOTION_SCALE) ? MOTION_SCALE.toFixed(1) : MOTION_SCALE}

${constants}

    /** Um tempo de desenho, em milissegundos, já na escala. */
    fun ms(designMs: Int): Int = (designMs * SCALE).roundToInt()

    /** O mesmo tempo como \`Long\`, para \`delay\`. */
    fun delayMs(designMs: Int): Long = ms(designMs).toLong()

    /**
     * A rigidez de uma mola na escala: o tempo de assentar cai com a raiz da rigidez, então metade do tempo pede o
     * quádruplo da rigidez.
     */
    fun stiffness(designStiffness: Float): Float = (designStiffness / (SCALE * SCALE)).toFloat()
}
`;
}

const outputs = [
  { path: generatedMotionCssPath, render: renderMotionCss },
  { path: generatedMotionKotlinPath, render: renderMotionKotlin },
];

export function generateMotion(): void {
  for (const { path, render } of outputs) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, render(), "utf8");
  }
}

export function checkMotion(): void {
  for (const { path, render } of outputs) {
    let actual = "";
    try {
      actual = readFileSync(path, "utf8");
    } catch {}
    if (actual !== render()) throw new Error(`${path} está desatualizado; rode ${COMMAND}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  if (process.argv.includes("--check")) {
    checkMotion();
    console.log("Motion em dia");
  } else {
    generateMotion();
    console.log(`Gerados ${generatedMotionCssPath} e ${generatedMotionKotlinPath}`);
  }
}
