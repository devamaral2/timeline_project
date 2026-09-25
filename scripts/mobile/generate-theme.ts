import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { darkTokens, lightTokens, type ThemeTokens } from "../../packages/theme/src/tokens";
import { oklchToCss } from "../../packages/theme/src/oklch";

export const generatedThemePath = resolve(
  fileURLToPath(new URL("../../apps/mobile/app/src/main/java/app/braid/mobile/core/designsystem/Color.kt", import.meta.url)),
);

const GENERATED_HEADER = "// GERADO por scripts/mobile/generate-theme.ts — não edite";

const tokenNames = [
  "background",
  "foreground",
  "card",
  "cardForeground",
  "primary",
  "primaryForeground",
  "secondary",
  "secondaryForeground",
  "muted",
  "mutedForeground",
  "accent",
  "accentForeground",
  "destructive",
  "destructiveForeground",
  "warning",
  "success",
  "border",
  "input",
  "ring",
  "brand",
  "brandAccent",
  "sleep",
  "training",
  "meal",
  "routine",
] as const;

type ColorTokenName = (typeof tokenNames)[number];

function byteToHex(value: number): string {
  return Math.round(value).toString(16).padStart(2, "0").toUpperCase();
}

/** Converte uma cor já resolvida pelo conversor OKLCH em ARGB Kotlin. */
export function toArgb(value: string): string {
  const resolved = oklchToCss(value);
  const hex = /^#([0-9a-f]{6})$/i.exec(resolved);
  if (hex) return `0xFF${hex[1].toUpperCase()}`;

  const rgba = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(resolved);
  if (!rgba) throw new Error(`Unsupported resolved color: ${resolved}`);

  const [, red, green, blue, alpha] = rgba;
  return `0x${byteToHex(Number(alpha) * 255)}${byteToHex(Number(red))}${byteToHex(Number(green))}${byteToHex(Number(blue))}`;
}

function renderTokenObject(name: "DarkTokens" | "LightTokens", tokens: ThemeTokens): string {
  const colors = tokenNames
    .map((tokenName) => `    val ${tokenName} = Color(${toArgb(tokens.colors[tokenName as ColorTokenName])})`)
    .join("\n");

  return `internal object ${name} {
${colors}
    val tagLightness = ${tokens.tag.lightness}f
    val tagChroma = ${tokens.tag.chroma}f
}`;
}

function renderColorScheme(
  name: "BraidDarkColorScheme" | "BraidLightColorScheme",
  functionName: "darkColorScheme" | "lightColorScheme",
  tokens: "DarkTokens" | "LightTokens",
): string {
  return `internal val ${name} =
    ${functionName}(
        primary = ${tokens}.primary,
        onPrimary = ${tokens}.primaryForeground,
        primaryContainer = ${tokens}.secondary,
        onPrimaryContainer = ${tokens}.secondaryForeground,
        secondary = ${tokens}.secondary,
        onSecondary = ${tokens}.secondaryForeground,
        secondaryContainer = ${tokens}.accent,
        onSecondaryContainer = ${tokens}.accentForeground,
        tertiary = ${tokens}.brandAccent,
        onTertiary = ${tokens}.background,
        tertiaryContainer = ${tokens}.routine,
        onTertiaryContainer = ${tokens}.foreground,
        background = ${tokens}.background,
        onBackground = ${tokens}.foreground,
        surface = ${tokens}.card,
        onSurface = ${tokens}.cardForeground,
        surfaceVariant = ${tokens}.muted,
        onSurfaceVariant = ${tokens}.mutedForeground,
        outline = ${tokens}.border,
        outlineVariant = ${tokens}.input,
        error = ${tokens}.destructive,
        onError = ${tokens}.destructiveForeground,
        errorContainer = ${tokens}.warning,
        onErrorContainer = ${tokens}.background,
        inverseSurface = ${tokens}.foreground,
        inverseOnSurface = ${tokens}.background,
        inversePrimary = ${tokens}.primary,
        scrim = Color.Black,
    )`;
}

export function renderThemeKotlin(): string {
  return `${GENERATED_HEADER}
// A fonte da verdade está em packages/theme/src/tokens.ts.

package app.braid.mobile.core.designsystem

import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

${renderTokenObject("DarkTokens", darkTokens)}

${renderTokenObject("LightTokens", lightTokens)}

${renderColorScheme("BraidDarkColorScheme", "darkColorScheme", "DarkTokens")}

${renderColorScheme("BraidLightColorScheme", "lightColorScheme", "LightTokens")}
`;
}

export function generateTheme(): void {
  const content = renderThemeKotlin();
  mkdirSync(dirname(generatedThemePath), { recursive: true });
  writeFileSync(generatedThemePath, content, "utf8");
}

export function checkTheme(): void {
  const expected = renderThemeKotlin();
  const actual = readFileSync(generatedThemePath, "utf8");
  if (actual !== expected) {
    throw new Error("Color.kt is stale; run pnpm --filter @repo/mobile run generate:theme");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  if (process.argv.includes("--check")) {
    checkTheme();
    console.log(`Checked ${generatedThemePath}`);
  } else {
    generateTheme();
    console.log(`Generated ${generatedThemePath}`);
  }
}
