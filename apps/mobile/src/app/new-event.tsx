import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { CreateEventInput } from "@repo/entities/contracts";
import { withAlpha } from "@repo/theme";
import { Button } from "@/components/Button";
import { TagInput } from "@/components/TagInput";
import { authedFetch } from "@/lib/api/client";
import { fieldSurface } from "@/lib/theme/surfaces";
import { useTheme } from "@/lib/theme/use-theme";

/**
 * Criacao de evento de rotina. O web oferece os quatro tipos; aqui comeca pelo
 * mais simples — os outros entram sobre a mesma base de formulario.
 */
export default function NewEventScreen() {
  const theme = useTheme();
  const { userId } = useLocalSearchParams<{ userId: string }>();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Dê um nome para o evento.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Tipado contra o contrato: o campo que o backend deixou de aceitar tem
      // de falhar aqui, no typecheck, e nao em um 400 no aparelho.
      const input: CreateEventInput = {
        // O evento nasce com um item, e ele e o principal por ser o unico. A
        // rotina nao tem payload: o que existe e o nome do evento.
        items: [{ type: "routine" }],
        name: name.trim(),
        description: description.trim() || undefined,
        tags,
      };

      await authedFetch<{ eventId: string }>("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      // `dismissTo` volta para a timeline que ja estava na pilha em vez de
      // empilhar outra. O carimbo e o que avisa a tela de que ha algo novo.
      router.dismissTo({
        pathname: "/[userId]",
        params: { userId, refreshedAt: String(Date.now()) },
      });
    } catch {
      setError("Não foi possível criar o evento. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = [styles.input, fieldSurface(theme), { color: theme.colors.foreground }];

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>
            Nome <Text style={{ color: theme.colors.destructive }}>*</Text>
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ex.: Estudar inglês"
            placeholderTextColor={withAlpha(theme.colors.mutedForeground, 0.7)}
            autoFocus
            style={inputStyle}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>Descrição</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Detalhes opcionais sobre o evento"
            placeholderTextColor={withAlpha(theme.colors.mutedForeground, 0.7)}
            multiline
            numberOfLines={3}
            style={[inputStyle, styles.textarea]}
          />
        </View>

        <TagInput tags={tags} onTagsChange={setTags} />

        {error ? <Text style={[styles.error, { color: theme.colors.destructive }]}>{error}</Text> : null}

        <View style={styles.actions}>
          <Button label="Cancelar" variant="outline" onPress={() => router.back()} />
          <Button
            label={submitting ? "Criando..." : "Criar evento"}
            loading={submitting}
            onPress={() => void handleSubmit()}
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
  content: {
    padding: 20,
    gap: 16,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  textarea: {
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 72,
    textAlignVertical: "top",
  },
  error: {
    fontSize: 12,
  },
  actions: {
    marginTop: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
});
