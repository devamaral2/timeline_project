import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import type { TimelineEventCardDto } from '@repo/entities/contracts';
import { longestDurationOf } from '@repo/timeline';
import { DaySummary } from '@/components/DaySummary';
import { EventCard } from '@/components/EventCard';
import { Message } from '@/components/Message';
import { useDayEvents } from '@/lib/events/use-day-events';
import { useTheme } from '@/lib/theme/use-theme';

interface DayTimelineProps {
  /** So a chave do cache por conta — quem autoriza a leitura e o token. */
  userId: string;
  dayKey: string;
  /** Muda a cada refresh da tela e faz esta pagina recarregar. */
  generation: number;
  onOpenEvent: (eventId: string) => void;
}

/**
 * Todos os eventos do dia selecionado, em ordem crescente de hora.
 *
 * A carga incremental sobe, e nao desce: a API pagina do mais novo para o mais
 * antigo, entao o que falta buscar esta antes do que ja apareceu. Por isso quem
 * pede a proxima pagina e o `onStartReached`, e o indicador de carga vive no
 * cabecalho — chegar ao fim da lista aqui e chegar ao fim do dia, e nao ha nada
 * depois disso.
 */
export function DayTimeline({
  userId,
  dayKey,
  generation,
  onOpenEvent,
}: DayTimelineProps) {
  const theme = useTheme();
  const { events, loading, loadingMore, failed, hasMore, reload, loadMore } =
    useDayEvents(userId, dayKey, generation);
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
            {loadingMore ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator
                  size="small"
                  color={theme.colors.mutedForeground}
                />
              </View>
            ) : null}
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
      // Sem cursor nao ha o que buscar, e o gatilho sai do caminho em vez de
      // ficar disparando contra o comeco do dia.
      onStartReached={hasMore ? loadMore : undefined}
      onStartReachedThreshold={0.3}
      // Os eventos mais antigos entram acima do que esta na tela. Sem isto a
      // lista pularia para outro trecho do dia a cada pagina que chega.
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
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
  loadingMore: {
    paddingBottom: 12,
    alignItems: 'center',
  },
});
