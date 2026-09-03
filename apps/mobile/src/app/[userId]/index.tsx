import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { dayKeyOf } from '@repo/timeline';
import { DayTimeline } from '@/components/DayTimeline';
import { TimelineHeader } from '@/components/TimelineHeader';
import { clearDayPages } from '@/lib/events/timeline-page-cache';
import { signOutFromGoogle } from '@/lib/firebase/google-sign-in';
import { useCurrentUser } from '@/lib/firebase/use-current-user';
import { useTheme } from '@/lib/theme/use-theme';

export default function TimelineScreen() {
  const theme = useTheme();
  const { userId, refreshedAt } = useLocalSearchParams<{
    userId: string;
    /** Carimbo que a tela de novo evento devolve — muda so quando algo foi criado. */
    refreshedAt?: string;
  }>();
  const { user, ready } = useCurrentUser();
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
        onSignOut={() => void signOutFromGoogle()}
      />

      {/*
        A lista so monta depois que o Firebase termina de reler a sessao. Quem
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  waiting: {
    flex: 1,
    justifyContent: 'center',
  },
});
