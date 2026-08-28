import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import {
  dayNumber,
  isSameMonth,
  monthGridOf,
  monthLabel,
  shiftMonthKey,
  weekOf,
  weekdayInitial,
} from '@repo/timeline';
import { withAlpha } from '@repo/theme';
import { ICON_STROKE_WIDTH } from '@/components/event-visuals';
import { cardShadow } from '@/lib/theme/surfaces';
import { useTheme } from '@/lib/theme/use-theme';

interface DayPickerProps {
  visible: boolean;
  selectedDayKey: string;
  todayKey: string;
  onSelect: (dayKey: string) => void;
  onClose: () => void;
}

/**
 * O calendario que o chevron do titulo abre.
 *
 * A regua da semana do cabecalho resolve o dia a dia; este resolve o salto
 * longo — o mes passado, uma data qualquer — que ninguem faz deslizando.
 */
export function DayPicker({
  visible,
  selectedDayKey,
  todayKey,
  onSelect,
  onClose,
}: DayPickerProps) {
  const theme = useTheme();
  // O mes folheado. Reabrir o calendario volta para o mes do dia aberto: quem
  // fechou em novembro e voltou nao esta procurando novembro de novo.
  const [monthKey, setMonthKey] = useState(selectedDayKey);
  useEffect(() => {
    if (visible) setMonthKey(selectedDayKey);
  }, [selectedDayKey, visible]);

  const grid = monthGridOf(monthKey);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/*
          O fundo e um irmao do cartao, e nao um pai dele: aninhar Pressable em
          Pressable funciona no nativo, mas no alvo web vira um <button> dentro
          de outro — HTML invalido, e o toque no cartao precisaria ser barrado a
          mao para nao fechar o calendario junto.
        */}
        <Pressable
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: withAlpha(theme.colors.background, 0.75) },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Fechar calendário"
          onPress={onClose}
        />
        <View
          style={[
            cardShadow(theme),
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              borderRadius: theme.radii.xl,
            },
          ]}
        >
          <View style={styles.monthBar}>
            <MonthArrow
              icon={ChevronLeft}
              label="Mês anterior"
              onPress={() =>
                setMonthKey((current) => shiftMonthKey(current, -1))
              }
            />
            <Text
              style={[styles.monthLabel, { color: theme.colors.foreground }]}
            >
              {monthLabel(monthKey)}
            </Text>
            <MonthArrow
              icon={ChevronRight}
              label="Próximo mês"
              onPress={() =>
                setMonthKey((current) => shiftMonthKey(current, 1))
              }
            />
          </View>

          <View style={styles.week}>
            {weekOf(monthKey).map((dayKey) => (
              <Text
                key={dayKey}
                style={[
                  styles.initial,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                {weekdayInitial(dayKey)}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {grid.map((dayKey) => {
              const selected = dayKey === selectedDayKey;
              const isToday = dayKey === todayKey;
              const outsideMonth = !isSameMonth(dayKey, monthKey);

              return (
                <Pressable
                  key={dayKey}
                  onPress={() => onSelect(dayKey)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={dayKey}
                  style={({ pressed }) => [
                    styles.cell,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <View
                    style={[
                      styles.cellDisc,
                      selected ? { backgroundColor: theme.colors.brand } : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.cellLabel,
                        {
                          color: selected
                            ? theme.colors.primaryForeground
                            : isToday
                              ? theme.colors.brand
                              : theme.colors.foreground,
                          fontWeight: selected || isToday ? '700' : '500',
                          // Os dias das bordas pertencem ao mes vizinho.
                          opacity: outsideMonth ? 0.35 : 1,
                        },
                      ]}
                    >
                      {dayNumber(dayKey)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => onSelect(todayKey)}
            accessibilityRole="button"
            accessibilityLabel="Ir para hoje"
            style={({ pressed }) => [
              styles.today,
              {
                borderColor: theme.colors.border,
                borderRadius: theme.radii.md,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Text style={[styles.todayLabel, { color: theme.colors.brand }]}>
              Hoje
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

interface MonthArrowProps {
  icon: typeof ChevronLeft;
  label: string;
  onPress: () => void;
}

function MonthArrow({ icon: Icon, label, onPress }: MonthArrowProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.arrow, { opacity: pressed ? 0.5 : 1 }]}
    >
      <Icon
        size={20}
        color={theme.colors.mutedForeground}
        strokeWidth={ICON_STROKE_WIDTH}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    padding: 16,
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  arrow: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 15.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  week: {
    marginTop: 8,
    flexDirection: 'row',
  },
  initial: {
    // A mesma fracao das celulas da grade, para que letra e numero se alinhem.
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  grid: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 3,
  },
  cellDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellLabel: {
    fontSize: 14,
  },
  today: {
    marginTop: 12,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  todayLabel: {
    fontSize: 13.5,
    fontWeight: '700',
  },
});
