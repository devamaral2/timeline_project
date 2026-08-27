import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { Button } from "@/components/Button";
import { signInWithGoogle } from "@/lib/firebase/google-sign-in";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { useTheme } from "@/lib/theme/use-theme";

export default function SignInScreen() {
  const theme = useTheme();
  const { user, ready } = useCurrentUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch {
      setError("Não foi possível entrar com o Google. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (user) {
    return <Redirect href={{ pathname: "/[userId]", params: { userId: user.uid } }} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.title, { color: theme.colors.foreground }]}>Time Composure</Text>
      <Button
        label={loading ? "Entrando..." : "Entrar com Google"}
        variant="outline"
        loading={loading}
        onPress={() => void handleSignIn()}
      />
      {error ? <Text style={[styles.error, { color: theme.colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: -0.4,
  },
  error: {
    fontSize: 12,
  },
});
