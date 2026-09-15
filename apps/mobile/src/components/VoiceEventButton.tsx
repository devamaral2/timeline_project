import { Mic, Square } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { withAlpha } from "@repo/theme";
import { ICON_STROKE_WIDTH } from "@/components/event-visuals";
import { VoiceJobStatus } from "@/components/VoiceJobStatus";
import { cardShadow } from "@/lib/theme/surfaces";
import { useTheme } from "@/lib/theme/use-theme";
import { useSpeechRecognition } from "@/lib/speech/use-speech-recognition";
import { useVoiceEventQueue } from "@/lib/voice-events/use-voice-event-queue";

interface VoiceEventButtonProps {
  onCreated: () => void;
}

/**
 * Irmao de apps/web/src/components/events/VoiceEventButton.tsx — mesma
 * fila, mesmo par de hooks, mesma ordem no cabecalho (antes do botao de novo
 * evento). O que muda e so a UI: sem Web Speech API a transcricao vem do
 * motor nativo do aparelho, e sem portal pro `body` o retorno do reconheci-
 * mento (o interim, o erro) e a fila de jobs flutuam sob o proprio botao, em
 * vez de um toast fixo no rodape da tela.
 */
export function VoiceEventButton({ onCreated }: VoiceEventButtonProps) {
  const theme = useTheme();
  const { jobs, enqueue, retry, dismiss } = useVoiceEventQueue({ onAllDone: onCreated });
  const { supported, listening, interim, error, start, stop } = useSpeechRecognition({
    onFinalTranscript: enqueue,
  });

  // Aparelho sem motor de reconhecimento de voz: nem mostramos o botao.
  if (!supported) return null;

  const hint = error ?? (listening ? interim : "");

  return (
    <View style={styles.anchor}>
      <Pressable
        onPress={listening ? stop : start}
        accessibilityRole="button"
        accessibilityLabel={listening ? "Parar gravação" : "Gravar evento por voz"}
        accessibilityState={{ selected: listening }}
        style={({ pressed }) => [
          styles.iconButton,
          {
            backgroundColor: listening ? theme.colors.destructive : theme.colors.brand,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        {listening ? (
          <Square size={16} color={theme.colors.destructiveForeground} fill={theme.colors.destructiveForeground} />
        ) : (
          <Mic size={19} color={theme.colors.primaryForeground} strokeWidth={ICON_STROKE_WIDTH} />
        )}
      </Pressable>

      <View style={styles.floating}>
        {hint ? (
          <View
            style={[
              styles.hint,
              cardShadow(theme),
              {
                backgroundColor: theme.colors.card,
                borderColor: error ? withAlpha(theme.colors.destructive, 0.4) : theme.colors.border,
              },
            ]}
          >
            <Text
              numberOfLines={2}
              style={[styles.hintText, { color: error ? theme.colors.destructive : theme.colors.mutedForeground }]}
            >
              {hint}
            </Text>
          </View>
        ) : null}

        <VoiceJobStatus jobs={jobs} onRetry={retry} onDismiss={dismiss} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: "relative",
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  floating: {
    position: "absolute",
    top: 48,
    right: 0,
    width: 220,
    gap: 6,
  },
  hint: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  hintText: {
    fontSize: 12,
    fontWeight: "500",
  },
});
