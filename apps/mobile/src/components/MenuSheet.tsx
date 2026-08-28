import { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarDays, LogOut, Plus, type LucideIcon } from "lucide-react-native";
import { withAlpha } from "@repo/theme";
import { ICON_STROKE_WIDTH } from "@/components/event-visuals";
import { Logo, Wordmark } from "@/components/Logo";
import { useTheme } from "@/lib/theme/use-theme";

interface MenuSheetProps {
  visible: boolean;
  /** O e-mail de quem esta logado, quando ja carregou. */
  accountLabel?: string;
  onClose: () => void;
  onNewEvent: () => void;
  onGoToToday: () => void;
  onSignOut: () => void;
}

/**
 * A gaveta do botao de menu do cabecalho.
 *
 * O hamburguer da referencia precisava abrir alguma coisa — um icone que nao
 * abre nada e uma promessa falsa. Aqui ele guarda a conta e as acoes que nao
 * cabem nos dois botoes do cabecalho.
 *
 * A animacao usa o `Animated` do proprio React Native, e nao o Reanimated: sao
 * dois valores interpolados uma vez por abertura, e nao vale puxar um runtime
 * de worklets para isso.
 */
export function MenuSheet({
  visible,
  accountLabel,
  onClose,
  onNewEvent,
  onGoToToday,
  onSignOut,
}: MenuSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(320, width * 0.82);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 220 : 160,
      useNativeDriver: true,
    }).start();
  }, [progress, visible]);

  return (
    <Modal
      visible={visible}
      transparent
      // A propria gaveta anima; deixar o Modal animar junto daria dois movimentos.
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "#000000", opacity: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.55],
            }) },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Fechar menu"
            onPress={onClose}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.panel,
            {
              width: panelWidth,
              paddingTop: insets.top + 24,
              paddingBottom: insets.bottom + 20,
              backgroundColor: theme.colors.card,
              borderRightColor: theme.colors.border,
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-panelWidth, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.identity}>
            <Logo size={30} />
            <Wordmark style={styles.wordmark} />
          </View>

          {accountLabel ? (
            <Text
              numberOfLines={1}
              style={[styles.account, { color: theme.colors.mutedForeground }]}
            >
              {accountLabel}
            </Text>
          ) : null}

          <View style={[styles.rule, { backgroundColor: theme.colors.border }]} />

          <MenuItem icon={Plus} label="Novo evento" onPress={onNewEvent} />
          <MenuItem icon={CalendarDays} label="Ir para hoje" onPress={onGoToToday} />

          <View style={styles.spacer} />

          <MenuItem
            icon={LogOut}
            label="Sair da conta"
            tone={theme.colors.destructive}
            onPress={onSignOut}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

interface MenuItemProps {
  icon: LucideIcon;
  label: string;
  tone?: string;
  onPress: () => void;
}

function MenuItem({ icon: Icon, label, tone, onPress }: MenuItemProps) {
  const theme = useTheme();
  const color = tone ?? theme.colors.foreground;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.item,
        {
          borderRadius: theme.radii.md,
          backgroundColor: pressed ? withAlpha(color, 0.1) : "transparent",
        },
      ]}
    >
      <Icon size={19} color={color} strokeWidth={ICON_STROKE_WIDTH} />
      <Text style={[styles.itemLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  panel: {
    flex: 1,
    paddingHorizontal: 16,
    borderRightWidth: 1,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 8,
  },
  wordmark: {
    flexShrink: 1,
  },
  account: {
    marginTop: 8,
    paddingHorizontal: 8,
    fontSize: 12,
    fontWeight: "500",
  },
  rule: {
    marginVertical: 18,
    height: 1,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  itemLabel: {
    fontSize: 14.5,
    fontWeight: "600",
  },
  spacer: {
    flex: 1,
  },
});
