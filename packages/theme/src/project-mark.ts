import { hueForTag, type Theme } from "./theme";

/** O que identifica um projeto na marca: o nome e se ele e o `personal`. */
export interface ProjectIdentity {
  name: string;
  personal: boolean;
}

/**
 * Separa o nome em palavras por espaco, `_`, `-`, `.`, `/` e pela passagem de
 * minuscula para maiuscula (`timelineProject`).
 */
function wordsOf(name: string): string[] {
  return name
    .replace(/(?<=\p{Ll})(?=\p{Lu})/gu, " ")
    .split(/[\s_\-./]+/u)
    .filter((word) => word.length > 0);
}

/**
 * As iniciais da marca, sempre em maiusculas: a inicial das duas primeiras
 * palavras ou, com uma so, os dois primeiros caracteres. `timeline_project` da
 * "TP", `agent-skills` da "AS", `t3code` da "T3" e `personal` da "PE". Um nome de
 * uma letra so tem uma inicial.
 */
export function projectInitials(name: string): string {
  const words = wordsOf(name);
  const letters =
    words.length >= 2
      ? words.slice(0, 2).map((word) => Array.from(word)[0] ?? "")
      : Array.from(words[0] ?? "").slice(0, 2);
  return letters.join("").toUpperCase();
}

/** Cor de um projeto comum: so o matiz vem do nome; o resto e o das tags do tema. */
export interface ColoredProjectMark {
  personal: false;
  hue: number;
  lightness: number;
  chroma: number;
  /** O texto da marca usa a cor do fundo da tela. */
  text: string;
}

/** `personal` nao tem cor: fundo suave, texto apagado e um fio de contorno. */
export interface PersonalProjectMark {
  personal: true;
  background: string;
  text: string;
  outline: string;
}

export type ProjectMarkColors = ColoredProjectMark | PersonalProjectMark;

/**
 * As cores da marca do projeto. O matiz vem do nome pela mesma funcao que da o
 * matiz das tags, com a luminosidade e o croma das tags do tema: o mesmo nome
 * tem sempre a mesma cor, no web e no Android.
 */
export function projectMarkColors(project: ProjectIdentity, theme: Theme): ProjectMarkColors {
  if (project.personal) {
    return {
      personal: true,
      background: theme.colors.muted,
      text: theme.colors.mutedForeground,
      outline: theme.colors.border,
    };
  }
  return {
    personal: false,
    hue: hueForTag(project.name),
    lightness: theme.tag.lightness,
    chroma: theme.tag.chroma,
    text: theme.colors.background,
  };
}
