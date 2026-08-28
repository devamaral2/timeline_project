import { useId } from "react";
import { StyleSheet, Text, type TextStyle } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { useTheme } from "@/lib/theme/use-theme";

/**
 * A marca do Time Composure: um anel com o gradiente roxo -> ciano, a forma de
 * onda do tempo registrado no meio e o brilho de IA no canto.
 *
 * E o mesmo desenho de `apps/web/src/components/brand/Logo.tsx`, aqui com
 * react-native-svg. Mudou la, muda aqui — sao a mesma marca.
 */

/** As alturas das barras da onda, em unidades do viewBox de 32. */
const WAVE_BARS = [8, 15, 11, 6];

export function Logo({ size = 40 }: { size?: number }) {
  const theme = useTheme();
  // Dois logos na mesma tela nao podem compartilhar o id do gradiente. O
  // `useId` do React devolve algo como ":r3:", e os dois-pontos atrapalham a
  // referencia por url(#id) — daí o corte.
  const gradientId = `logo${useId().replace(/:/g, "")}`;
  const fill = `url(#${gradientId})`;

  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Defs>
        <LinearGradient id={gradientId} x1="4" y1="28" x2="28" y2="4" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={theme.colors.brand} />
          <Stop offset="1" stopColor={theme.colors.brandAccent} />
        </LinearGradient>
      </Defs>

      <Circle cx="16" cy="16" r="13" stroke={fill} strokeWidth="2" fill="none" />

      {WAVE_BARS.map((height, index) => (
        <Rect
          key={height}
          x={10.5 + index * 3.5}
          y={16 - height / 2}
          width="2"
          height={height}
          rx="1"
          fill={fill}
        />
      ))}

      {/* O brilho de IA — a mesma faisca que marca as acoes automaticas. */}
      <Path
        d="M26 3.5 26.9 6.1 29.5 7 26.9 7.9 26 10.5 25.1 7.9 22.5 7 25.1 6.1Z"
        fill={theme.colors.brandAccent}
      />
    </Svg>
  );
}

/**
 * O logotipo, em uma cor so — igual ao web. A cor da marca fica restrita ao
 * simbolo acima.
 */
export function Wordmark({ fontSize = 18, style }: { fontSize?: number; style?: TextStyle }) {
  const theme = useTheme();

  return (
    <Text
      numberOfLines={1}
      style={[
        styles.wordmark,
        { fontSize, lineHeight: fontSize * 1.3, color: theme.colors.foreground },
        style,
      ]}
    >
      Time Composure
    </Text>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    fontWeight: "600",
    letterSpacing: -0.3,
  },
});
