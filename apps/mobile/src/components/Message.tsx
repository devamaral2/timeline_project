import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/lib/theme/use-theme";
import { Button } from "./Button";

interface MessageProps {
  text: string;
  tone?: "muted" | "error";
  onRetry?: () => void;
}

/** Estado vazio, de carregamento ou de erro no meio de uma tela. */
export function Message({ text, tone = "muted", onRetry }: MessageProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <Text
        style={[
          styles.text,
          { color: tone === "error" ? theme.colors.destructive : theme.colors.mutedForeground },
        ]}
      >
        {text}
      </Text>
      {onRetry ? <Button label="Tentar novamente" variant="outline" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  text: {
    fontSize: 14,
    textAlign: "center",
  },
});
