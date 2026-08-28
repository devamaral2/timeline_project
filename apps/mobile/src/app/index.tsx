import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { withAlpha } from "@repo/theme";
import { Button } from "@/components/Button";
import { Logo, Wordmark } from "@/components/Logo";
import { signInWithGoogle } from "@/lib/firebase/google-sign-in";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { useTheme } from "@/lib/theme/use-theme";

/** As promessas do produto, do material da marca. A primeira e a que se destaca. */
const CLAIMS = ["IA", "Rápido", "Inteligente", "Completo", "Equilibrado"];

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
        <ActivityIndicator color={theme.colors.brand} />
      </View>
    );
  }

  if (user) {
    return <Redirect href={{ pathname: "/[userId]", params: { userId: user.uid } }} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* A marca dentro do anel, sem halo: o simbolo ja carrega a cor. */}
      <View style={styles.mark}>
        <View
          style={[
            styles.markRing,
            { borderColor: theme.colors.border, backgroundColor: withAlpha(theme.colors.card, 0.4) },
          ]}
        />
        <Logo size={64} />
      </View>

      <Wordmark fontSize={30} style={styles.wordmark} />

      <Text style={[styles.tagline, { color: theme.colors.mutedForeground }]}>
        Sua vida organizada.{"\n"}Sua mente em equilíbrio.
      </Text>

      <View style={styles.claims}>
        {CLAIMS.map((claim, index) => (
          <View
            key={claim}
            style={[
              styles.claim,
              index === 0
                ? { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand }
                : { borderColor: theme.colors.border },
            ]}
          >
            <Text
              style={[
                styles.claimLabel,
                index === 0
                  ? { color: theme.colors.primaryForeground, fontWeight: "600" }
                  : { color: theme.colors.mutedForeground },
              ]}
            >
              {claim}
            </Text>
          </View>
        ))}
      </View>

      <Button
        label={loading ? "Entrando..." : "Entrar com Google"}
        variant="outline"
        loading={loading}
        onPress={() => void handleSignIn()}
        style={styles.signIn}
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
    paddingHorizontal: 24,
  },
  mark: {
    width: 104,
    height: 104,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  markRing: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 1,
    borderRadius: 999,
  },
  wordmark: {
    textAlign: "center",
  },
  tagline: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 24,
    textAlign: "center",
  },
  claims: {
    marginTop: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  claim: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  claimLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  signIn: {
    marginTop: 28,
  },
  error: {
    marginTop: 12,
    fontSize: 12,
  },
});
