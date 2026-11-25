// Monta a extensão em dist/: três bundles (o service worker, o script que lê a
// página e a tela de opções) e os arquivos estáticos. `--watch` refaz a cada
// mudança; depois é só recarregar a extensão em chrome://extensions.
import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build, context } from "esbuild";

const root = fileURLToPath(new URL(".", import.meta.url));
const out = `${root}dist`;
const watch = process.argv.includes("--watch");

const common = { bundle: true, target: "chrome116", platform: "browser", sourcemap: watch ? "inline" : false, logLevel: "info", absWorkingDir: root };
const bundles = [
  { ...common, entryPoints: ["src/background.ts"], outfile: "dist/background.js", format: "esm" },
  // Injetado na página: um script clássico, sem import nem export.
  { ...common, entryPoints: ["src/capture/index.ts"], outfile: "dist/capture.js", format: "iife" },
  { ...common, entryPoints: ["src/options/options.ts"], outfile: "dist/options.js", format: "iife" },
];

async function copyStatic() {
  await mkdir(out, { recursive: true });
  await Promise.all([
    cp(`${root}manifest.json`, `${out}/manifest.json`),
    cp(`${root}src/options/options.html`, `${out}/options.html`),
    cp(`${root}src/options/options.css`, `${out}/options.css`),
    cp(`${root}icons`, `${out}/icons`, { recursive: true, filter: (source) => !source.endsWith(".svg") }),
  ]);
}

await rm(out, { recursive: true, force: true });
await copyStatic();
if (watch) {
  await Promise.all(bundles.map(async (options) => (await context(options)).watch()));
} else {
  await Promise.all(bundles.map((options) => build(options)));
}
