const HASHTAG = /(^|\s)#([\p{L}\p{N}_-]+)/gu;

/**
 * Separa o texto dos detalhes em descrição e tags: cada `#palavra` vira uma tag
 * (minúscula, sem repetir) e sai da descrição; linhas que ficam vazias somem.
 */
export function splitDetailsAndTags(details: string): { description: string; tags: string[] } {
  const tags: string[] = [];
  const lines = details.split("\n").map((line) =>
    line
      .replace(HASHTAG, (_match, lead: string, tag: string) => {
        const normalized = tag.toLocaleLowerCase("pt-BR");
        if (!tags.includes(normalized)) tags.push(normalized);
        return lead;
      })
      .trimEnd(),
  );
  const description = lines.filter((line, index) => line.trim() !== "" || (index > 0 && index < lines.length - 1)).join("\n").trim();
  return { description, tags };
}

/** O inverso de `splitDetailsAndTags`: a descrição seguida das tags como `#tag`, numa linha própria. */
export function joinDetailsAndTags(description: string, tags: readonly string[]): string {
  if (tags.length === 0) return description;
  const hashtags = tags.map((tag) => `#${tag}`).join(" ");
  return description ? `${description}\n${hashtags}` : hashtags;
}
