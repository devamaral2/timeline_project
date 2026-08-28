import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  dayNumber,
  longDate,
  weekOf,
  weekday,
  weekdayInitial,
} from '@repo/timeline';
import { useTheme } from '@/lib/theme/use-theme';

interface WeekStripProps {
  /** O dia selecionado. A semana mostrada e a dele. */
  selectedDayKey: string;
  todayKey: string;
  onSelect: (dayKey: string) => void;
}

/**
 * A regua de datas do cabecalho: os sete dias da semana do dia aberto, de
 * domingo a sabado.
 *
 * Tocar num dia substitui diretamente o conteudo da lista abaixo.
 */
export const WeekStrip = memo(function WeekStrip({
  selectedDayKey,
  todayKey,
  onSelect,
}: WeekStripProps) {
  const theme = useTheme();

  return (
    <View style={styles.strip}>
      {weekOf(selectedDayKey).map((dayKey) => {
        const selected = dayKey === selectedDayKey;
        const isToday = dayKey === todayKey;

        return (
          <Pressable
            key={dayKey}
            onPress={() => onSelect(dayKey)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${weekday(dayKey)}, ${longDate(dayKey)}`}
            style={({ pressed }) => [
              styles.day,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text
              style={[styles.initial, { color: theme.colors.mutedForeground }]}
            >
              {weekdayInitial(dayKey)}
            </Text>

            <View
              style={[
                styles.number,
                selected ? { backgroundColor: theme.colors.brand } : null,
              ]}
            >
              <Text
                style={[
                  styles.numberLabel,
                  {
                    color: selected
                      ? theme.colors.primaryForeground
                      : isToday
                        ? theme.colors.brand
                        : theme.colors.foreground,
                    fontWeight: selected || isToday ? '700' : '500',
                  },
                ]}
              >
                {dayNumber(dayKey)}
              </Text>
            </View>

            {/* O ponto marca hoje, para que hoje continue visivel depois de
                navegar para longe dele. */}
            <View
              style={[
                styles.marker,
                isToday ? { backgroundColor: theme.colors.brand } : null,
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  initial: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  number: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberLabel: {
    fontSize: 15,
  },
  marker: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
});
