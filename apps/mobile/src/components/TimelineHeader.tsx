import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, Menu, Plus } from 'lucide-react-native';
import { mediumDate, relativeDayLabel } from '@repo/timeline';
import { withAlpha } from '@repo/theme';
import { DayPicker } from '@/components/DayPicker';
import { ICON_STROKE_WIDTH } from '@/components/event-visuals';
import { MenuSheet } from '@/components/MenuSheet';
import { WeekStrip } from '@/components/WeekStrip';
import { useTheme } from '@/lib/theme/use-theme';

interface TimelineHeaderProps {
  /** O dia selecionado — o titulo e a regua falam dele. */
  selectedDayKey: string;
  todayKey: string;
  /** O e-mail de quem esta logado, mostrado na gaveta. */
  accountLabel?: string;
  onSelectDay: (dayKey: string) => void;
  onNewEvent: () => void;
  onSignOut: () => void;
}

/**
 * O cabecalho do mobile. O web tem o irmao dele em
 * `apps/web/src/components/layout/TimelineHeader.tsx`: a mesma data central e
 * a mesma regua, com a marca no lugar do menu.
 *
 * Aqui o espaco e vertical e a navegacao e por data, entao quem fica no centro
 * e a data aberta — com o menu e o novo evento nos cantos, e a regua da semana
 * embaixo. A regua resolve os dias da semana e o calendario do chevron faz o
 * salto longo.
 */
export function TimelineHeader({
  selectedDayKey,
  todayKey,
  accountLabel,
  onSelectDay,
  onNewEvent,
  onSignOut,
}: TimelineHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const isToday = selectedDayKey === todayKey;

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + 10,
          backgroundColor: theme.colors.card,
          borderBottomColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.bar}>
        <Pressable
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Abrir menu"
          style={({ pressed }) => [
            styles.iconButton,
            {
              borderColor: theme.colors.border,
              backgroundColor: withAlpha(theme.colors.foreground, 0.04),
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Menu
            size={20}
            color={theme.colors.foreground}
            strokeWidth={ICON_STROKE_WIDTH}
          />
        </Pressable>

        <Pressable
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${mediumDate(selectedDayKey)}. Escolher outra data`}
          style={({ pressed }) => [
            styles.titleBlock,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <View style={styles.titleRow}>
            <Text
              numberOfLines={1}
              style={[
                styles.title,
                // Fora de hoje o titulo puxa a cor da marca: e o aviso de que
                // a tela nao esta mais no dia corrente.
                {
                  color: isToday ? theme.colors.foreground : theme.colors.brand,
                },
              ]}
            >
              {relativeDayLabel(selectedDayKey, todayKey)}
            </Text>
            <ChevronDown
              size={16}
              color={
                isToday ? theme.colors.mutedForeground : theme.colors.brand
              }
              strokeWidth={2}
            />
          </View>
          <Text
            numberOfLines={1}
            style={[styles.date, { color: theme.colors.mutedForeground }]}
          >
            {mediumDate(selectedDayKey)}
          </Text>
        </Pressable>

        <Pressable
          onPress={onNewEvent}
          accessibilityRole="button"
          accessibilityLabel="Novo evento"
          style={({ pressed }) => [
            styles.iconButton,
            styles.newEvent,
            {
              backgroundColor: theme.colors.brand,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <Plus
            size={21}
            color={theme.colors.primaryForeground}
            strokeWidth={2.25}
          />
        </Pressable>
      </View>

      <WeekStrip
        selectedDayKey={selectedDayKey}
        todayKey={todayKey}
        onSelect={onSelectDay}
      />

      <MenuSheet
        visible={menuOpen}
        accountLabel={accountLabel}
        onClose={() => setMenuOpen(false)}
        onNewEvent={() => {
          setMenuOpen(false);
          onNewEvent();
        }}
        onGoToToday={() => {
          setMenuOpen(false);
          onSelectDay(todayKey);
        }}
        onSignOut={() => {
          setMenuOpen(false);
          onSignOut();
        }}
      />

      <DayPicker
        visible={pickerOpen}
        selectedDayKey={selectedDayKey}
        todayKey={todayKey}
        onSelect={(dayKey) => {
          setPickerOpen(false);
          onSelectDay(dayKey);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  bar: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newEvent: {
    borderWidth: 0,
  },
  titleBlock: {
    flex: 1,
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  date: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
});
