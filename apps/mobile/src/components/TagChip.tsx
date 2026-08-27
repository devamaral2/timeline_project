import { StyleSheet, Text, View } from "react-native";
import { tagColors } from "@repo/theme";
import { useTheme } from "@/lib/theme/use-theme";

/** Chip de tag: a cor vem do nome, pelo mesmo hash que o web usa. */
export function TagChip({ name }: { name: string }) {
  const theme = useTheme();
  const colors = tagColors(name, theme);

  return (
    <View style={[styles.chip, { backgroundColor: colors.backgroundColor }]}>
      <Text style={[styles.label, { color: colors.color }]}>#{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  label: {
    fontSize: 11.5,
    fontWeight: "500",
  },
});
