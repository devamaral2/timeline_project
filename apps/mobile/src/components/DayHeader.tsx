import { StyleSheet, Text, View } from "react-native";
import { withAlpha } from "@repo/theme";
import { longDate, trackedMinutesOf, weekday, type TimelineDay } from "@repo/timeline";
import { useTheme } from "@/lib/theme/use-theme";

/**
 * Cabecalho de um dia. O web tem duas variantes (coluna no desktop, empilhado
 * no mobile); aqui so a segunda faz sentido.
 */
export function DayHeader({ day }: { day: TimelineDay }) {
  const theme = useTheme();
  const trackedHours = Math.round(trackedMinutesOf(day.events) / 60);
  const eventLabel = day.events.length === 1 ? "evento" : "eventos";

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: theme.colors.background,
          borderBottomWidth: day.isToday ? 2 : 1,
          borderBottomColor: day.isToday ? withAlpha(theme.colors.primary, 0.6) : theme.colors.border,
        },
      ]}
    >
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.colors.foreground }]}>{longDate(day.dayKey)}</Text>
        {day.isToday ? (
          <View style={[styles.badge, { backgroundColor: withAlpha(theme.colors.primary, 0.1) }]}>
            <Text style={[styles.badgeLabel, { color: theme.colors.primary }]}>HOJE</Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
        {weekday(day.dayKey)} · {day.events.length} {eventLabel} · {trackedHours}h registradas
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 20,
    paddingBottom: 8,
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  title: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "500",
  },
});
