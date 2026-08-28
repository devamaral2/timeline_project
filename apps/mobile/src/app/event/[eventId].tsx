import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import type { EventDetailDto } from "@repo/entities/contracts";
import { formatTime } from "@repo/timeline";
import { Message } from "@/components/Message";
import { MissedBadge } from "@/components/MissedBadge";
import { TagChip } from "@/components/TagChip";
import { priorityLabels, typeLabels } from "@/components/event-visuals";
import { authedFetch } from "@/lib/api/client";
import { useTheme } from "@/lib/theme/use-theme";

export default function EventDetailScreen() {
  const theme = useTheme();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const [event, setEvent] = useState<EventDetailDto | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    authedFetch<EventDetailDto>(`/api/events/${eventId}`)
      .then((data) => {
        if (!cancelled) setEvent(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  return (
    <>
      <Stack.Screen options={{ title: event?.name ?? "Evento" }} />
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
      >
        {failed ? (
          <Message text="Não foi possível carregar o evento." tone="error" />
        ) : !event ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : (
          <EventDetailBody event={event} />
        )}
      </ScrollView>
    </>
  );
}

function EventDetailBody({ event }: { event: EventDetailDto }) {
  const theme = useTheme();

  return (
    <View style={styles.body}>
      <View style={styles.summary}>
        <View style={styles.typeRow}>
          <Text style={[styles.type, { color: theme.colors.foreground }]}>
            {typeLabels[event.type]}
          </Text>
          <MissedBadge missed={event.missed} />
        </View>
        <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
          {formatTime(event.startedAt)} →{" "}
          {event.finishedAt ? formatTime(event.finishedAt) : "em andamento"}
        </Text>
      </View>

      {/* A anotacao de nao realizado ja esta no selo la em cima. A prioridade
          nao tem selo, entao e esta linha que a mostra. */}
      <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
        Prioridade: {priorityLabels[event.priority]}
      </Text>

      {event.description ? (
        <Text style={[styles.description, { color: theme.colors.cardForeground }]}>
          {event.description}
        </Text>
      ) : null}

      {event.tags.length > 0 ? (
        <View style={styles.tags}>
          {event.tags.map((tag) => (
            <TagChip key={tag} name={tag} />
          ))}
        </View>
      ) : null}

      <TypeDetails event={event} />

      {event.interruptions.length > 0 ? (
        <Section title="Interrupções">
          {event.interruptions.map((interruption) => (
            <View key={interruption.id} style={styles.entry}>
              <View style={styles.entryRow}>
                <Text
                  numberOfLines={1}
                  style={[styles.entryName, { color: theme.colors.cardForeground }]}
                >
                  {interruption.name}
                </Text>
                <Text style={[styles.entryValue, { color: theme.colors.mutedForeground }]}>
                  {formatTime(interruption.startedAt)}–{formatTime(interruption.finishedAt)}
                </Text>
              </View>
              {interruption.description ? (
                <Text style={[styles.entryNote, { color: theme.colors.mutedForeground }]}>
                  {interruption.description}
                </Text>
              ) : null}
            </View>
          ))}
        </Section>
      ) : null}
    </View>
  );
}

/** Os campos que so existem em um tipo de evento — o mesmo recorte do web. */
function TypeDetails({ event }: { event: EventDetailDto }) {
  const theme = useTheme();
  const valueStyle = [styles.entryValue, { color: theme.colors.mutedForeground }];

  switch (event.type) {
    case "sleep":
      return (
        <Section title="Sono">
          <Text style={valueStyle}>
            Tempo monitorado: {event.data.trackedSleepTime} min · Pontuação: {event.data.score}
          </Text>
        </Section>
      );
    case "training":
      return event.data.workouts.length > 0 ? (
        <Section title="Treinos">
          {event.data.workouts.map((workout, index) => (
            <View key={workout.id ?? index} style={styles.entryRow}>
              <Text style={[styles.entryName, { color: theme.colors.cardForeground }]}>
                {workout.type}
              </Text>
              <Text style={valueStyle}>
                {workout.duration} min · {workout.calories} kcal
              </Text>
            </View>
          ))}
        </Section>
      ) : null;
    case "food":
      return event.data.items.length > 0 ? (
        <Section title="Alimentos">
          {event.data.items.map((item, index) => (
            <View key={item.id ?? index} style={styles.entryRow}>
              <Text
                numberOfLines={1}
                style={[styles.entryName, { color: theme.colors.cardForeground }]}
              >
                {item.food} ({item.portion})
              </Text>
              <Text style={valueStyle}>{item.caloriesKcal} kcal</Text>
            </View>
          ))}
        </Section>
      ) : null;
    case "routine":
      return null;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}>
        {title.toUpperCase()}
      </Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    flexGrow: 1,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
  },
  body: {
    gap: 16,
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  type: {
    fontSize: 14,
    fontWeight: "500",
  },
  meta: {
    fontSize: 14,
  },
  description: {
    fontSize: 13.5,
    lineHeight: 24,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  section: {
    gap: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
  },
  sectionBody: {
    gap: 6,
  },
  entry: {
    gap: 2,
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  entryName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
  },
  entryValue: {
    fontSize: 13,
  },
  entryNote: {
    fontSize: 13,
  },
});
