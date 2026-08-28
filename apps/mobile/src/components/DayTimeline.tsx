import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import type { TimelineEventCardDto } from '@repo/entities/contracts';
import { longestDurationOf } from '@repo/timeline';
import { DaySummary } from '@/components/DaySummary';
import { EventCard } from '@/components/EventCard';
import { Message } from '@/components/Message';
import { useDayEvents } from '@/lib/events/use-day-events';
import { useTheme } from '@/lib/theme/use-theme';

interface DayTimelineProps {
  userId: string;
  dayKey: string;
  /** Muda a cada refresh da tela e faz esta pagina recarregar. */
  generation: number;
  onOpenEvent: (eventId: string) => void;
}

/** Todos os eventos do dia selecionado, em ordem crescente de hora. */
export function DayTimeline({
  userId,
  dayKey,
  generation,
  onOpenEvent,
}: DayTimelineProps) {
  const theme = useTheme();
  const { events, loading, failed, reload } = useDayEvents(
    userId,
    dayKey,
    generation,
  );
  const longestMinutes = longestDurationOf(events);

  return (
    <FlatList
      style={styles.timeline}
      data={events}
      keyExtractor={(event: TimelineEventCardDto) => event.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        events.length > 0 ? (
          <>
            {failed ? (
              <Message
                text="Não foi possível atualizar este dia."
                tone="error"
                onRetry={reload}
              />
            ) : null}
            <DaySummary events={events} />
          </>
        ) : null
      }
      renderItem={({ item }) => (
        <EventCard
          event={item}
          longestMinutes={longestMinutes}
          onPress={() => onOpenEvent(item.id)}
        />
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      onRefresh={reload}
      refreshing={loading && events.length > 0}
      ListEmptyComponent={
        loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : failed ? (
          <Message
            text="Não foi possível carregar este dia."
            tone="error"
            onRetry={reload}
          />
        ) : (
          <Message text="Nenhum evento registrado neste dia." />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  timeline: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    flexGrow: 1,
  },
  separator: {
    height: 12,
  },
  centered: {
    paddingVertical: 48,
    alignItems: 'center',
  },
});
