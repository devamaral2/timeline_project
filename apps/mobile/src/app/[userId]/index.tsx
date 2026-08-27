import { useEffect } from "react";
import { ActivityIndicator, SectionList, StyleSheet, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import type { TimelineEventCardDto } from "@repo/entities/contracts";
import { DayHeader } from "@/components/DayHeader";
import { EventCard } from "@/components/EventCard";
import { Message } from "@/components/Message";
import { TimelineHeader } from "@/components/TimelineHeader";
import { useTimeline } from "@/lib/events/use-timeline";
import { signOutFromGoogle } from "@/lib/firebase/google-sign-in";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { useTheme } from "@/lib/theme/use-theme";

export default function TimelineScreen() {
  const theme = useTheme();
  const { userId, refreshedAt } = useLocalSearchParams<{
    userId: string;
    /** Carimbo que a tela de novo evento devolve — muda so quando algo foi criado. */
    refreshedAt?: string;
  }>();
  const { user, ready } = useCurrentUser();
  const { days, loading, refreshing, reachedEnd, failed, loadMore, refresh } = useTimeline(userId);

  useEffect(() => {
    if (refreshedAt) refresh();
  }, [refreshedAt, refresh]);

  if (ready && !user) return <Redirect href="/" />;

  const sections = days.map((day) => ({ day, data: day.events }));

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <TimelineHeader
        onNewEvent={() => router.push({ pathname: "/new-event", params: { userId } })}
        onSignOut={() => void signOutFromGoogle()}
      />

      <SectionList
        sections={sections}
        keyExtractor={(event: TimelineEventCardDto) => event.id}
        contentContainerStyle={styles.list}
        renderSectionHeader={({ section }) => <DayHeader day={section.day} />}
        renderItem={({ item }) => (
          <EventCard
            event={item}
            onPress={() => router.push({ pathname: "/event/[eventId]", params: { eventId: item.id } })}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        onRefresh={refresh}
        refreshing={refreshing}
        // Sem isso os cabecalhos de dia grudam no topo e cobrem os cartoes.
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          loading ? null : failed ? (
            <Message text="Não foi possível carregar a timeline." tone="error" onRetry={loadMore} />
          ) : reachedEnd ? (
            <Message text="Nenhum evento registrado nesta timeline ainda." />
          ) : null
        }
        ListFooterComponent={
          <TimelineFooter
            // Durante um refresh quem mostra o giro e o indicador de puxar.
            loading={loading && !refreshing}
            failed={failed}
            reachedEnd={reachedEnd}
            hasDays={days.length > 0}
            onRetry={loadMore}
          />
        }
      />
    </View>
  );
}

interface TimelineFooterProps {
  loading: boolean;
  failed: boolean;
  reachedEnd: boolean;
  hasDays: boolean;
  onRetry: () => void;
}

function TimelineFooter({ loading, failed, reachedEnd, hasDays, onRetry }: TimelineFooterProps) {
  const theme = useTheme();

  if (loading) {
    return (
      <View style={styles.footer}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }
  if (failed && hasDays) {
    return <Message text="Não foi possível carregar mais eventos." tone="error" onRetry={onRetry} />;
  }
  if (reachedEnd && hasDays) {
    return <Message text="Você chegou ao fim da timeline." />;
  }
  return null;
}

const styles = StyleSheet.create({
  screen: {
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
  footer: {
    paddingVertical: 24,
  },
});
