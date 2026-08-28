"use client";

// Cliente por causa do `useId`, que da o id unico do gradiente: dois logos na
// mesma pagina nao podem compartilhar um `<linearGradient id>`.

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * A marca do Time Composure: um anel com o gradiente roxo -> ciano, a forma de
 * onda do tempo registrado no meio e o brilho de IA no canto.
 *
 * O mesmo desenho existe em `apps/mobile/src/components/Logo.tsx`, la com
 * react-native-svg. Mudou aqui, muda la — sao a mesma marca.
 */

/** As alturas das barras da onda, em unidades do viewBox de 32. */
const WAVE_BARS = [8, 15, 11, 6];

interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 40, className }: LogoProps) {
  const gradientId = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Time Composure"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="4" y1="28" x2="28" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--brand)" />
          <stop offset="1" stopColor="var(--brand-accent)" />
        </linearGradient>
      </defs>

      <circle cx="16" cy="16" r="13" stroke={`url(#${gradientId})`} strokeWidth="2" />

      {WAVE_BARS.map((height, index) => (
        <rect
          key={height}
          x={10.5 + index * 3.5}
          y={16 - height / 2}
          width="2"
          height={height}
          rx="1"
          fill={`url(#${gradientId})`}
        />
      ))}

      {/* O brilho de IA — a mesma faisca que marca as acoes automaticas na UI. */}
      <path
        d="M26 3.5 26.9 6.1 29.5 7 26.9 7.9 26 10.5 25.1 7.9 22.5 7 25.1 6.1Z"
        fill="var(--brand-accent)"
      />
    </svg>
  );
}

/**
 * O logotipo, em uma cor so. O gradiente da marca fica restrito ao simbolo
 * acima — no texto ele pesava, e a leitura em uma cor e mais limpa.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("truncate font-semibold tracking-tight text-foreground", className)}>
      Time Composure
    </span>
  );
}
