import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { X } from "lucide-react-native";
import type { TagSuggestionDto } from "@repo/entities/contracts";
import { tagColors, withAlpha } from "@repo/theme";
import { authedFetch } from "@/lib/api/client";
import { fieldSurface } from "@/lib/theme/surfaces";
import { useTheme } from "@/lib/theme/use-theme";

interface TagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
}

/**
 * Campo de tags com chips e autocomplete, como no web. As sugestoes vem do
 * trecho sendo digitado agora, e a lista aparece embaixo do campo em vez de
 * flutuando — no celular um popover cobriria o teclado.
 */
export function TagInput({ tags, onTagsChange }: TagInputProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<TagSuggestionDto[]>([]);

  useEffect(() => {
    const query = draft.trim();
    if (!query) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(() => {
      authedFetch<TagSuggestionDto[]>(`/api/tags?query=${encodeURIComponent(query)}&limit=6`)
        .then((data) => {
          if (!cancelled) setSuggestions(data.filter((item) => !tags.includes(item.name)));
        })
        .catch(() => {
          // Sem sugestao o campo ainda funciona: e so digitar a tag inteira.
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [draft, tags]);

  function commit(value: string) {
    const name = value.trim().toLowerCase();
    setDraft("");
    setSuggestions([]);
    if (!name || tags.includes(name)) return;
    onTagsChange([...tags, name]);
  }

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.foreground }]}>Tags</Text>

      <View style={[styles.box, fieldSurface(theme)]}>
        {tags.map((tag) => {
          const colors = tagColors(tag, theme);
          return (
            <View key={tag} style={[styles.chip, { backgroundColor: colors.backgroundColor }]}>
              <Text style={[styles.chipLabel, { color: colors.color }]}>#{tag}</Text>
              <Pressable
                onPress={() => onTagsChange(tags.filter((current) => current !== tag))}
                accessibilityRole="button"
                accessibilityLabel={`Remover tag ${tag}`}
                hitSlop={8}
              >
                <X size={12} color={colors.color} />
              </Pressable>
            </View>
          );
        })}

        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => commit(draft)}
          onBlur={() => commit(draft)}
          placeholder={tags.length ? "" : "Ex.: foco, manhã"}
          placeholderTextColor={withAlpha(theme.colors.mutedForeground, 0.7)}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          style={[styles.input, { color: theme.colors.foreground }]}
        />
      </View>

      {suggestions.length > 0 ? (
        <View
          style={[
            styles.suggestions,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.card,
              borderRadius: theme.radii.xl,
            },
          ]}
        >
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion.id}
              onPress={() => commit(suggestion.name)}
              style={({ pressed }) => [
                styles.suggestion,
                { backgroundColor: pressed ? theme.colors.accent : "transparent" },
              ]}
            >
              <View
                style={[styles.dot, { backgroundColor: tagColors(suggestion.name, theme).color }]}
              />
              <Text style={[styles.suggestionLabel, { color: theme.colors.foreground }]}>
                {suggestion.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
  },
  box: {
    minHeight: 44,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  input: {
    flexGrow: 1,
    minWidth: 90,
    fontSize: 14,
    paddingVertical: 4,
  },
  suggestions: {
    borderWidth: 1,
    overflow: "hidden",
  },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  suggestionLabel: {
    fontSize: 13,
  },
});
