import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import type {
  EventDetailDto,
  EventItemDto,
  MealItem,
  SleepItem,
  TrainingData,
} from "@repo/entities/contracts";
import { formatTime } from "@repo/timeline";
import { Message } from "@/components/Message";
import { MissedBadge } from "@/components/MissedBadge";
import { TagChip } from "@/components/TagChip";
import { ICON_STROKE_WIDTH, priorityLabels, visualForItemType } from "@/components/event-visuals";
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

/**
 * O item que da a cara ao evento.
 *
 * Ele e encontrado pelo `primaryItemId`, e nao pela primeira posicao do array:
 * a ordem dos itens e a que o usuario montou, e ser o principal e uma escolha a
 * parte. Num evento composto as duas divergem, e ler pela ordem mostraria o
 * item errado.
 */
function primaryItemOf(event: EventDetailDto): EventItemDto | undefined {
  return event.items.find((item) => item.id === event.primaryItemId);
}

function EventDetailBody({ event }: { event: EventDetailDto }) {
  const theme = useTheme();
  // Sem item principal reconhecido — um tipo que este app ainda nao conhece, ou
  // uma resposta de backend mais novo — o cabecalho cai no visual generico em
  // vez de quebrar: o nome, a hora e as tags continuam valendo.
  const { Icon, label, colorToken } = visualForItemType(primaryItemOf(event)?.type ?? "");
  const accent = theme.colors[colorToken];

  return (
    <View style={styles.body}>
      <View style={styles.summary}>
        <View style={styles.typeRow}>
          <Icon size={18} color={accent} strokeWidth={ICON_STROKE_WIDTH} />
          <Text style={[styles.type, { color: accent }]}>{label}</Text>
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

      {/*
        Todos os itens, na ordem em que o usuario os montou. Um evento composto
        — o treino que tambem registrou a refeicao de depois — guarda mais de um,
        e mostrar so o principal deixaria o resto sem lugar nenhum onde aparecer.
      */}
      {event.items.map((item) => (
        <ItemDetails key={item.id} item={item} />
      ))}

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

/** O payload que so existe em um tipo de item — o mesmo recorte do web. */
function ItemDetails({ item }: { item: EventItemDto }) {
  switch (item.type) {
    case "sleep":
      return <SleepDetails data={item.data} />;
    case "training":
      return <TrainingDetails data={item.data} />;
    case "meal":
      return <MealDetails data={item.data} />;
    case "routine":
      // Rotina nao tem payload: o nome e o horario, la em cima, sao tudo.
      return null;
    default:
      // Um tipo que este app ainda nao conhece. O que e comum a todo evento ja
      // esta desenhado; desenhar o payload seria adivinhar o formato dele.
      return null;
  }
}

function SleepDetails({ data }: { data: SleepItem }) {
  const theme = useTheme();

  return (
    <Section title="Sono">
      <Text style={[styles.entryValue, { color: theme.colors.mutedForeground }]}>
        Tempo monitorado: {data.trackedSleepTime} min · Pontuação: {data.score}
      </Text>
    </Section>
  );
}

function TrainingDetails({ data }: { data: TrainingData }) {
  const theme = useTheme();
  if (data.workouts.length === 0) return null;

  return (
    <Section title="Treinos">
      {data.workouts.map((workout) => (
        <View key={workout.id} style={styles.entryRow}>
          <Text
            numberOfLines={1}
            style={[styles.entryName, { color: theme.colors.cardForeground }]}
          >
            {workout.workoutName}
          </Text>
          <Text style={[styles.entryValue, { color: theme.colors.mutedForeground }]}>
            {workout.duration} min · {workout.calories} kcal
          </Text>
        </View>
      ))}
    </Section>
  );
}

function MealDetails({ data }: { data: MealItem }) {
  const theme = useTheme();
  if (data.foodItems.length === 0) return null;

  return (
    <Section title="Alimentos">
      {data.foodItems.map((foodItem) => (
        <View key={foodItem.id} style={styles.entryRow}>
          <Text
            numberOfLines={1}
            style={[styles.entryName, { color: theme.colors.cardForeground }]}
          >
            {foodItem.name} ({foodItem.portion})
          </Text>
          <Text style={[styles.entryValue, { color: theme.colors.mutedForeground }]}>
            {foodItem.caloriesKcal} kcal
          </Text>
        </View>
      ))}
      <Text style={[styles.entryNote, { color: theme.colors.mutedForeground }]}>
        {data.totals.totalCaloriesKcal} kcal · {data.totals.totalProteinGrams} g de proteína ·{" "}
        {data.totals.totalCarbohydrateGrams} g de carboidrato · {data.totals.totalFatGrams} g de
        gordura
      </Text>
    </Section>
  );
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
