import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect } from 'expo-router';
import { withAlpha } from '@repo/theme';
import { Button } from '@/components/Button';
import { Logo, Wordmark } from '@/components/Logo';
import { session, useSession, type SignInResult } from '@/lib/auth/session';
import { fieldSurface } from '@/lib/theme/surfaces';
import { useTheme } from '@/lib/theme/use-theme';

/** As promessas do produto, do material da marca. A primeira e a que se destaca. */
const CLAIMS = ['IA', 'Rápido', 'Inteligente', 'Completo', 'Equilibrado'];

const FAILURE_MESSAGES: Record<
  Extract<SignInResult, { ok: false }>['reason'],
  string
> = {
  // Nunca diz qual dos dois estava errado: o apps/auth tambem nao diz.
  invalid_credentials: 'E-mail ou senha incorretos.',
  rate_limited: 'Muitas tentativas. Aguarde um pouco e tente novamente.',
  unavailable:
    'Não foi possível entrar agora. Verifique a conexão e tente novamente.',
};

export default function SignInScreen() {
  const theme = useTheme();
  const { user, ready } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordInput = useRef<TextInput>(null);
  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  async function handleSignIn() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    const result = await session.signIn(email.trim(), password);
    setLoading(false);
    // No sucesso quem navega e o `Redirect` abaixo, que reage a sessao.
    if (!result.ok) setError(FAILURE_MESSAGES[result.reason]);
  }

  if (!ready) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <ActivityIndicator color={theme.colors.brand} />
      </View>
    );
  }

  if (user) {
    return (
      <Redirect
        href={{ pathname: '/[userId]', params: { userId: user.userId } }}
      />
    );
  }

  const inputStyle = [
    styles.input,
    fieldSurface(theme),
    { color: theme.colors.foreground },
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* A marca dentro do anel, sem halo: o simbolo ja carrega a cor. */}
        <View style={styles.mark}>
          <View
            style={[
              styles.markRing,
              {
                borderColor: theme.colors.border,
                backgroundColor: withAlpha(theme.colors.card, 0.4),
              },
            ]}
          />
          <Logo size={64} />
        </View>

        <Wordmark fontSize={30} style={styles.wordmark} />

        <Text style={[styles.tagline, { color: theme.colors.mutedForeground }]}>
          Sua vida organizada.{'\n'}Sua mente em equilíbrio.
        </Text>

        <View style={styles.claims}>
          {CLAIMS.map((claim, index) => (
            <View
              key={claim}
              style={[
                styles.claim,
                index === 0
                  ? {
                      backgroundColor: theme.colors.brand,
                      borderColor: theme.colors.brand,
                    }
                  : { borderColor: theme.colors.border },
              ]}
            >
              <Text
                style={[
                  styles.claimLabel,
                  index === 0
                    ? {
                        color: theme.colors.primaryForeground,
                        fontWeight: '600',
                      }
                    : { color: theme.colors.mutedForeground },
                ]}
              >
                {claim}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.form}>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            E-mail
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            accessibilityLabel="E-mail"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordInput.current?.focus()}
            maxLength={320}
            style={inputStyle}
          />

          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            Senha
          </Text>
          <TextInput
            ref={passwordInput}
            value={password}
            onChangeText={setPassword}
            accessibilityLabel="Senha"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => void handleSignIn()}
            maxLength={1024}
            style={inputStyle}
          />

          {error ? (
            <Text
              accessibilityRole="alert"
              style={[styles.error, { color: theme.colors.destructive }]}
            >
              {error}
            </Text>
          ) : null}

          <Button
            label={loading ? 'Entrando...' : 'Entrar'}
            loading={loading}
            disabled={!canSubmit}
            onPress={() => void handleSignIn()}
            style={styles.signIn}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  mark: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  markRing: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 1,
    borderRadius: 999,
  },
  wordmark: {
    textAlign: 'center',
  },
  tagline: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
  },
  claims: {
    marginTop: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
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
    fontWeight: '500',
  },
  form: {
    marginTop: 28,
    width: '100%',
    maxWidth: 360,
  },
  label: {
    marginBottom: 4,
    marginTop: 12,
    fontSize: 12,
    fontWeight: '500',
  },
  input: {
    height: 44,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  signIn: {
    marginTop: 20,
  },
  error: {
    marginTop: 12,
    fontSize: 12,
  },
});
