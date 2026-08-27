import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LogOut, Plus, Sparkles } from "lucide-react-native";
import { withAlpha } from "@repo/theme";
import { useTheme } from "@/lib/theme/use-theme";
import { Button } from "./Button";

interface TimelineHeaderProps {
  onNewEvent: () => void;
  onSignOut: () => void;
}

export function TimelineHeader({ onNewEvent, onSignOut }: TimelineHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + 12,
          backgroundColor: theme.colors.card,
          borderBottomColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.identity}>
        <View style={[styles.mark, { backgroundColor: withAlpha(theme.colors.primary, 0.1) }]}>
          <Sparkles size={20} color={theme.colors.primary} />
        </View>
        <Text numberOfLines={1} style={[styles.title, { color: theme.colors.foreground }]}>
          Time Composure
        </Text>
      </View>

      <View style={styles.actions}>
        <Button label="Novo" icon={Plus} onPress={onNewEvent} />
        <Button
          label="Sair"
          icon={LogOut}
          variant="outline"
          onPress={onSignOut}
          style={styles.signOut}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  identity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  mark: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  signOut: {
    paddingHorizontal: 12,
  },
});
