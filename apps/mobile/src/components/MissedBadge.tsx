import { StyleSheet, Text, View } from "react-native";
import { withAlpha } from "@repo/theme";
import { missedColor, missedLabel } from "@/components/event-visuals";
import { useTheme } from "@/lib/theme/use-theme";

/**
 * O selo de "nao realizado", irmao do `MissedBadge.tsx` do web.
 *
 * E o unico selo de situacao, e ele so existe quando o usuario anotou o evento
 * como perdido. Sem anotacao nao ha selo: nao anotado nao e uma situacao, e
 * desenhar "Realizado" em tudo que sobrou seria afirmar uma coisa que ninguem
 * afirmou.
 *
 * Aceita `undefined` porque a resposta vem pela rede — um backend de outra
 * versao nao pode derrubar a lista por causa de um campo que nao mandou.
 */
export function MissedBadge({ missed }: { missed: boolean | undefined }) {
  const theme = useTheme();
  if (!missed) return null;

  const color = missedColor(theme);
  return (
    <View style={[styles.badge, { backgroundColor: withAlpha(color, 0.15) }]}>
      <Text style={[styles.label, { color }]}>{missedLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
  },
});
