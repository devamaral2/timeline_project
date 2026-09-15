import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { dayKeyOf } from '@repo/timeline';
import { DayTimeline } from '@/components/DayTimeline';
import { TimelineHeader } from '@/components/TimelineHeader';
import { clearDayPages } from '@/lib/events/timeline-page-cache';
import { session, useSession } from '@/lib/auth/session';
import { useTheme } from '@/lib/theme/use-theme';

export default function TimelineScreen() {
  const theme = useTheme();
  const { userId, refreshedAt } = useLocalSearchParams<{
    userId: string;
    /** Carimbo que a tela de novo evento devolve — muda so quando algo foi criado. */
    refreshedAt?: string;
  }>();
  const { user, ready } = useSession();
  // Fixo na montagem para que cabecalho e lista usem a mesma referencia.
  const [todayKey] = useState(() => dayKeyOf(new Date()));
  const [selectedDayKey, setSelectedDayKey] = useState(todayKey);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!refreshedAt) return;
    clearDayPages();
    setGeneration((current) => current + 1);
  }, [refreshedAt]);

  if (ready && !user) return <Redirect href="/" />;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <TimelineHeader
        selectedDayKey={selectedDayKey}
        todayKey={todayKey}
        accountLabel={user?.email ?? undefined}
        onSelectDay={setSelectedDayKey}
        onNewEvent={() =>
          router.push({ pathname: '/new-event', params: { userId } })
        }
        onSignOut={() => void signOutAndForget()}
      />

      {/*
        A lista so monta depois que a sessao e relida do SecureStore. Quem
        autoriza a leitura agora e o token, e pedir antes de ele existir voltaria
        um 401 — a tela acusaria uma falha que e so pressa.
      */}
      {ready ? (
        <DayTimeline
          userId={userId}
          dayKey={selectedDayKey}
          generation={generation}
          onOpenEvent={(eventId) =>
            router.push({ pathname: '/event/[eventId]', params: { eventId } })
          }
        />
      ) : (
        <View style={styles.waiting}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      )}
    </View>
  );
}

/** A sessao some e o cache de dias vai junto: a proxima conta nao ve os eventos desta. */
async function signOutAndForget(): Promise<void> {
  clearDayPages();
  await session.signOut();
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  waiting: {
    flex: 1,
    justifyContent: 'center',
  },
});
