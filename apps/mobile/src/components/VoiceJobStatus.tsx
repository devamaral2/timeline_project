import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { AlertTriangle, X } from "lucide-react-native";
import { withAlpha } from "@repo/theme";
import { ICON_STROKE_WIDTH } from "@/components/event-visuals";
import { useTheme } from "@/lib/theme/use-theme";
import type { VoiceJob } from "@/lib/voice-events/use-voice-event-queue";

interface VoiceJobStatusProps {
  jobs: VoiceJob[];
  onRetry: (jobId: string) => void;
  onDismiss: (jobId: string) => void;
}

/**
 * Irmao de apps/web/src/components/events/VoiceJobStatus.tsx. O web ancora
 * num toast fixo no rodape do viewport via portal pro `body`; o RN nao tem
 * portal sem uma dependencia nova, entao aqui a fila fica no mesmo lugar
 * flutuante do `VoiceEventButton` que a monta — o que a mantem sem bloquear o
 * resto da tela, que era o ponto do toast `pointer-events-none` no web.
 */
export function VoiceJobStatus({ jobs, onRetry, onDismiss }: VoiceJobStatusProps) {
  const theme = useTheme();

  if (jobs.length === 0) return null;

  const pendingCount = jobs.filter((job) => job.status === "pending").length;
  const failedJobs = jobs.filter((job) => job.status === "error");

  return (
    <View style={styles.stack}>
      {failedJobs.map((job) => (
        <View
          key={job.id}
          style={[
            styles.toast,
            { backgroundColor: theme.colors.card, borderColor: withAlpha(theme.colors.destructive, 0.4) },
          ]}
        >
          <AlertTriangle size={14} color={theme.colors.destructive} strokeWidth={ICON_STROKE_WIDTH} />
          <Text numberOfLines={2} style={[styles.message, { color: theme.colors.foreground }]}>
            {job.error}
          </Text>
          <Pressable
            onPress={() => onRetry(job.id)}
            accessibilityRole="button"
            accessibilityLabel="Tentar de novo"
            hitSlop={6}
          >
            <Text style={[styles.retry, { color: theme.colors.brandAccent }]}>Repetir</Text>
          </Pressable>
          <Pressable
            onPress={() => onDismiss(job.id)}
            accessibilityRole="button"
            accessibilityLabel="Dispensar"
            hitSlop={6}
          >
            <X size={13} color={theme.colors.mutedForeground} />
          </Pressable>
        </View>
      ))}

      {pendingCount > 0 ? (
        <View style={[styles.toast, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <ActivityIndicator size="small" color={theme.colors.brandAccent} />
          <Text style={[styles.message, { color: theme.colors.foreground }]}>
            {pendingCount === 1 ? "Criando evento..." : `Criando ${pendingCount} eventos...`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 6,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  message: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
  },
  retry: {
    fontSize: 11,
    fontWeight: "700",
  },
});
