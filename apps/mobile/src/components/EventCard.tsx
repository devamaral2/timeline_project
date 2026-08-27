import { Pressable, StyleSheet, Text, View } from "react-native";
import type { TimelineEventCardDto } from "@repo/entities/contracts";
import { formatTime } from "@repo/timeline";
import { typeIcons, typeSurface } from "@/components/event-visuals";
import { withAlpha } from "@repo/theme";
import { TagChip } from "@/components/TagChip";
import { useTheme } from "@/lib/theme/use-theme";

interface EventCardProps {
  event: TimelineEventCardDto;
  onPress: () => void;
}

export function EventCard({ event, onPress }: EventCardProps) {
  const theme = useTheme();
  const Icon = typeIcons[event.type];
  const accent = theme.colors[event.type];
  const isRunning = !event.finishedAt;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${event.name}`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderColor: isRunning ? withAlpha(theme.colors.primary, 0.4) : theme.colors.border,
          borderRadius: theme.radii.xl,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {/* A barrinha do tipo, colada na borda esquerda — como no web. */}
      <View style={[styles.accentBar, { backgroundColor: accent }]} />

      <View style={styles.row}>
        <View style={styles.identity}>
          <View
            style={[
              styles.iconBox,
              { backgroundColor: typeSurface(event.type, theme), borderRadius: theme.radii.lg },
            ]}
          >
            <Icon size={16} color={accent} />
          </View>
          <Text numberOfLines={1} style={[styles.name, { color: theme.colors.cardForeground }]}>
            {event.name}
          </Text>
        </View>

        <View style={styles.timing}>
          <View style={styles.timeRow}>
            {isRunning ? <View style={[styles.dot, { backgroundColor: theme.colors.primary }]} /> : null}
            <Text style={[styles.time, { color: theme.colors.mutedForeground }]}>
              {formatTime(event.startedAt)} →{" "}
              {event.finishedAt ? formatTime(event.finishedAt) : "em andamento"}
            </Text>
          </View>
          <Text style={[styles.duration, { color: withAlpha(theme.colors.mutedForeground, 0.8) }]}>
            {event.durationLabel}
          </Text>
        </View>
      </View>

      {event.tags.length > 0 ? (
        <View style={styles.tags}>
          {event.tags.map((tag) => (
            <TagChip key={tag} name={tag} />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 14,
    paddingLeft: 22,
    overflow: "hidden",
  },
  accentBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  identity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconBox: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    flex: 1,
    fontSize: 14.5,
    lineHeight: 20,
    fontWeight: "600",
  },
  timing: {
    alignItems: "flex-end",
    gap: 4,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  time: {
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "500",
  },
  duration: {
    fontSize: 10.5,
    fontWeight: "500",
  },
  tags: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
});
