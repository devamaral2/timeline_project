import { createElement, type ReactNode } from "react";
import { createLucideIcon, Youtube } from "lucide-react";

/**
 * Os desenhos próprios dos tipos: os de tarefa (refeição, sono, treino) e os de artefato que não têm tarefa de
 * mesmo nome (exercício, roteador, notícias, resumo de e-mail). A transcrição usa o ícone do YouTube do lucide. Saíram do canvas "Ícones de artefatos", na grade de 24 do lucide, só a traço.
 * Cada desenho existe uma vez aqui e é usado de duas formas: como ícone solto, com as mesmas props dos ícones do
 * lucide (`PlateIcon`), e como traçados dentro de um `<svg>` de quem já tem o seu (`TypeIconPaths`, no
 * `task-kind-mark.tsx`). O app Android repete os mesmos traçados em `core/designsystem/BraidIcons.kt` e
 * `ui/documents/DocumentIcons.kt`.
 */
type IconNode = Parameters<typeof createLucideIcon>[1];

/** Refeição: o garfo, o prato e a faca. */
const plate: IconNode = [
  ["path", { d: "M2.5 4.5V8a1.5 1.5 0 0 0 3 0V4.5", key: "fork" }],
  ["path", { d: "M4 9.5v10", key: "fork-stem" }],
  ["circle", { cx: "12", cy: "12", r: "4", key: "plate" }],
  ["path", { d: "M21 19.5v-15c-1.5 1-2.25 3.2-2.25 5.5v3H21", key: "knife" }],
];

/** Sono: a lua crescente com uma estrela no vão. */
const moonStar: IconNode = [
  ["path", { d: "M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a7.1 7.1 0 0 0 10 10z", key: "moon" }],
  ["path", { d: "M18.5 2.5v5", key: "star-v" }],
  ["path", { d: "M16 5h5", key: "star-h" }],
];

/** Treino: a barra com duas anilhas de cada lado. */
const barbell: IconNode = [
  ["path", { d: "M6.5 6v12", key: "plate-l" }],
  ["path", { d: "M17.5 6v12", key: "plate-r" }],
  ["path", { d: "M3.5 9v6", key: "collar-l" }],
  ["path", { d: "M20.5 9v6", key: "collar-r" }],
  ["path", { d: "M6.5 12h11", key: "bar" }],
];

/** Exercício: a figura de braços abertos, no meio do movimento. */
const movement: IconNode = [
  ["circle", { cx: "12", cy: "4.5", r: "2", key: "head" }],
  ["path", { d: "M5.5 7.5l6.5 3 6.5-3", key: "arms" }],
  ["path", { d: "M12 10.5V15", key: "torso" }],
  ["path", { d: "M7.5 21l4.5-6 4.5 6", key: "legs" }],
];

/** Roteador: a bússola. */
const compass: IconNode = [
  ["circle", { cx: "12", cy: "12", r: "8.5", key: "rim" }],
  ["path", { d: "M15.75 8.25l-1.9 5.6-5.6 1.9 1.9-5.6z", key: "needle" }],
];

/** Notícias: o jornal dobrado, com as linhas do texto. */
const newspaper: IconNode = [
  ["path", { d: "M4 5.5h13v13a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z", key: "page" }],
  ["path", { d: "M17 9.5h2.5a1.5 1.5 0 0 1 1.5 1.5v7.5a2 2 0 0 1-2 2", key: "fold" }],
  ["path", { d: "M7.5 9h6", key: "line-1" }],
  ["path", { d: "M7.5 12.5h6", key: "line-2" }],
  ["path", { d: "M7.5 16h3.5", key: "line-3" }],
];

/** Resumo de e-mail: a carta fechada. */
const letter: IconNode = [
  ["path", { d: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z", key: "envelope" }],
  ["path", { d: "M3.5 7.5l8.5 6 8.5-6", key: "flap" }],
];

export const typeIconNodes = { plate, moonStar, barbell, movement, compass, newspaper, letter } as const;

/** Os traçados de um desenho, para dentro de um `<svg>` que já define grade e traço. */
export function TypeIconPaths({ node }: { node: IconNode }): ReactNode {
  return node.map(([tag, attrs]) => createElement(tag, attrs));
}

export const PlateIcon = createLucideIcon("plate", plate);
export const MoonStarIcon = createLucideIcon("moon-star", moonStar);
export const BarbellIcon = createLucideIcon("barbell", barbell);
export const MovementIcon = createLucideIcon("movement", movement);
export const CompassIcon = createLucideIcon("compass", compass);
export const NewspaperIcon = createLucideIcon("newspaper", newspaper);
export const LetterIcon = createLucideIcon("letter", letter);
/** Transcrição: o ícone do YouTube, o mesmo traço dos outros. */
export const YoutubeIcon = Youtube;
