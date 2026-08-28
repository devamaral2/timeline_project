import { Pressable, StyleSheet, Text, View } from "react-native";
import type { TimelineEventCardDto } from "@repo/entities/contracts";
import {
  durationRatioOf,
  elapsedSecondsOf,
  formatStopwatch,
  formatTime,
  MIN_DURATION_RATIO,
} from "@repo/timeline";
import { ICON_STROKE_WIDTH, eventAccent, typeIcons, typeLabels } from "@/components/event-visuals";
import { withAlpha } from "@repo/theme";
import { MissedBadge } from "@/components/MissedBadge";
import { TagChip } from "@/components/TagChip";
import { useNow } from "@/lib/events/use-now";
import { cardShadow } from "@/lib/theme/surfaces";
import { useTheme } from "@/lib/theme/use-theme";

interface EventCardProps {
  event: TimelineEventCardDto;
  /**
   * Duracao do evento mais longo do mesmo dia, em minutos: a escala da barra
   * do rodape. Comparar contra o dia e o que faz a barra dizer alguma coisa —
   * os cartoes que estao juntos na tela sao os do mesmo dia.
   */
  longestMinutes: number;
  onPress: () => void;
}

/**
 * O cartao de um evento.
 *
 * Ele se divide em dois de proposito: so o evento em andamento assina o relogio
 * de um segundo, e ele e o unico que precisa redesenhar a cada tique. Um dia
 * inteiro de eventos ja encerrados nao repinta nada.
 */
export function EventCard(props: EventCardProps) {
  return props.event.finishedAt ? (
    <Card {...props} elapsedSeconds={null} />
  ) : (
    <RunningCard {...props} />
  );
}

function RunningCard(props: EventCardProps) {
  const now = useNow();
  return <Card {...props} elapsedSeconds={elapsedSecondsOf(props.event.startedAt, now)} />;
}

interface CardProps extends EventCardProps {
  /** Segundos corridos, so no evento em andamento. */
  elapsedSeconds: number | null;
}

function Card({ event, longestMinutes, elapsedSeconds, onPress }: CardProps) {
  const theme = useTheme();
  const Icon = typeIcons[event.type];
  const accent = eventAccent(theme, event.type);
  const isRunning = elapsedSeconds !== null;

  // A barra do evento em andamento cresce com o cronometro, na mesma escala do
  // dia — quando ele passa do mais longo do dia, ela para de crescer na borda.
  const ratio = isRunning
    ? longestMinutes > 0
      ? Math.min(1, Math.max(MIN_DURATION_RATIO, elapsedSeconds / 60 / longestMinutes))
      : MIN_DURATION_RATIO
    : durationRatioOf(event, longestMinutes);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${event.name}`}
      style={({ pressed }) => [
        cardShadow(theme),
        { borderRadius: theme.radii.xl, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {/*
        A sombra fica no Pressable e o recorte aqui dentro: no iOS um
        "overflow: hidden" no mesmo elemento recortaria tambem a sombra.
      */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.card,
            borderColor: isRunning ? withAlpha(theme.colors.brand, 0.45) : theme.colors.border,
            borderRadius: theme.radii.xl,
          },
        ]}
      >
        {/*
          O icone entra direto sobre a superficie do cartao — sem quadradinho de
          fundo e sem aro —, como no board da identidade. Quem diz o tipo sao a
          cor e o rotulo em cima do nome.
        */}
        <View style={styles.row}>
          <Icon size={24} color={accent} strokeWidth={ICON_STROKE_WIDTH} />

          <View style={styles.identity}>
            {/* Tipo e status dividem a linha de cima: um diz o que o evento e,
                o outro em que pe ele esta. */}
            <View style={styles.typeRow}>
              <Text numberOfLines={1} style={[styles.type, { color: accent }]}>
                {typeLabels[event.type]}
              </Text>
              <MissedBadge missed={event.missed} />
            </View>
            <Text numberOfLines={1} style={[styles.name, { color: theme.colors.cardForeground }]}>
              {event.name}
            </Text>
          </View>

          <View style={styles.timing}>
            <View style={styles.timeRow}>
              {isRunning ? (
                <View style={[styles.dot, { backgroundColor: theme.colors.brand }]} />
              ) : null}
              <Text style={[styles.time, { color: theme.colors.mutedForeground }]}>
                {formatTime(event.startedAt)} →{" "}
                {event.finishedAt ? formatTime(event.finishedAt) : "em andamento"}
              </Text>
            </View>

            {/*
              O contador. Enquanto a tarefa corre, o lugar do `durationLabel` —
              que a API manda como "--" justamente porque ainda nao ha duracao —
              recebe o tempo subindo, na cor da marca. Quando ela termina, o
              mesmo lugar passa a mostrar o registro que veio do backend.
            */}
            {elapsedSeconds === null ? (
              <Text
                style={[styles.duration, { color: withAlpha(theme.colors.mutedForeground, 0.8) }]}
              >
                {event.durationLabel}
              </Text>
            ) : (
              <Text
                accessibilityLabel={`Em andamento ha ${formatStopwatch(elapsedSeconds)}`}
                style={[styles.stopwatch, { color: theme.colors.brand }]}
              >
                {formatStopwatch(elapsedSeconds)}
              </Text>
            )}
          </View>
        </View>

        {event.tags.length > 0 ? (
          <View style={styles.tags}>
            {event.tags.map((tag) => (
              <TagChip key={tag} name={tag} />
            ))}
          </View>
        ) : null}

        {/*
          A barra de duracao. Ela mede o tempo gasto sem mexer na altura do
          cartao: dois eventos de tamanhos muito diferentes continuam ocupando
          a mesma area da lista, e a comparacao acontece na largura da linha.
        */}
        <View style={styles.durationBar}>
          <View
            style={[
              styles.durationFill,
              {
                width: `${(ratio ?? MIN_DURATION_RATIO) * 100}%`,
                backgroundColor: isRunning ? theme.colors.brand : accent,
              },
            ]}
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 14,
    // Segura o conteudo dentro dos cantos arredondados.
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  identity: {
    flex: 1,
    gap: 1,
  },
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  type: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "500",
  },
  name: {
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
    fontWeight: "600",
  },
  stopwatch: {
    fontSize: 12.5,
    fontWeight: "700",
    // Os digitos mudam a cada segundo; sem largura fixa o numero balanca.
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.2,
  },
  tags: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  durationBar: {
    marginTop: 14,
    flexDirection: "row",
  },
  durationFill: {
    height: 3,
    borderRadius: 999,
  },
});
