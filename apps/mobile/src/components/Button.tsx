import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { withAlpha } from "@repo/theme";
import { useTheme } from "@/lib/theme/use-theme";

interface ButtonProps {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  /** `primary` para a acao principal, `outline` para as secundarias. */
  variant?: "primary" | "outline" | "destructive";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

/**
 * O botao do design system. A acao principal e a unica coisa da tela
 * preenchida com a cor da marca — e por isso que ela e a principal. As demais
 * ficam sobre o fundo, com a borda de sempre.
 */
export function Button({
  label,
  onPress,
  icon: Icon,
  variant = "primary",
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const isOutline = variant === "outline";
  const foreground = isOutline ? theme.colors.foreground : theme.colors.primaryForeground;
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        isOutline
          ? { backgroundColor: withAlpha(theme.colors.card, 0.6), borderColor: theme.colors.border }
          : {
              backgroundColor:
                variant === "destructive" ? theme.colors.destructive : theme.colors.primary,
              borderColor: "transparent",
            },
        { opacity: inactive ? 0.6 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={foreground} />
        ) : Icon ? (
          <Icon size={16} color={foreground} />
        ) : null}
        <Text style={[styles.label, { color: foreground, fontWeight: isOutline ? "500" : "600" }]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: {
    fontSize: 14,
  },
});
