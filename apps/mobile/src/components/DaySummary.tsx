import { StyleSheet, Text, View } from "react-native";
import { trackedMinutesOf } from "@repo/timeline";
import type { TimelineEventCardDto } from "@repo/entities/contracts";
import { useTheme } from "@/lib/theme/use-theme";

/**
 * A linha de resumo no topo do dia aberto.
 *
 * Antes o dia trazia um cabecalho com a data por extenso — ele fazia sentido
 * quando a lista era um scroll continuo de varios dias. Agora quem diz a data e
 * o cabecalho da tela, e aqui sobra so o que ele nao diz: quanto tem no dia.
 */
export function DaySummary({ events }: { events: readonly TimelineEventCardDto[] }) {
  const theme = useTheme();
  const trackedHours = Math.round(trackedMinutesOf(events) / 60);
  const eventLabel = events.length === 1 ? "evento" : "eventos";

  return (
    <View style={styles.summary}>
      <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
        {events.length} {eventLabel} · {trackedHours}h registradas
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    paddingTop: 18,
    paddingBottom: 12,
  },
  label: {
    fontSize: 12.5,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
