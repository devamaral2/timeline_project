import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
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
  const background =
    variant === "primary"
      ? theme.colors.primary
      : variant === "destructive"
        ? theme.colors.destructive
        : theme.colors.card;
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
        {
          backgroundColor: background,
          borderColor: isOutline ? theme.colors.border : background,
          opacity: inactive ? 0.6 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : Icon ? (
        <Icon size={16} color={foreground} />
      ) : null}
      <Text style={[styles.label, { color: foreground, fontWeight: isOutline ? "500" : "600" }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  label: {
    fontSize: 14,
  },
});
