import { Bot, FileText, Route, Wrench, type LucideIcon } from "lucide-react";
import { visualForItemType } from "@/components/tasks/task-visuals";
import styles from "./note-sheet.module.css";

const HERMES_ICONS: Record<string, LucideIcon> = { skill: Wrench, agent: Bot, router: Route };

/** O ícone de um tipo de nota: o do tipo de tarefa nas estruturadas, o do arquivo nas do Hermes, a folha no texto. */
export function noteTypeIcon(type: string): LucideIcon {
  if (type === "meal" || type === "training" || type === "sleep") return visualForItemType(type).Icon;
  return HERMES_ICONS[type] ?? FileText;
}

/**
 * O desenho da folha em cada tamanho, na caixa quadrada em que ela fica
 * centrada: o contorno com o canto cortado, a dobra e os dois traços de texto
 * embaixo. Os cantos são bem menos arredondados que os do quadrado da tarefa
 * (4 contra 13), para a forma ler como folha de papel. O ícone do tipo é posicionado pelo CSS, no canto de cima à esquerda.
 */
const SHEETS = {
  list: {
    box: 44,
    outline: "M9.5 .5h20l9 9v30a4 4 0 0 1-4 4h-25a4 4 0 0 1-4-4v-35a4 4 0 0 1 4-4Z",
    fold: "M29.5 .5v7a2 2 0 0 0 2 2h7",
    lines: "M14.5 28h15M14.5 34h15",
  },
  cite: {
    box: 32,
    outline: "M7.5 .5h14l6 6v22a3 3 0 0 1-3 3h-17a3 3 0 0 1-3-3v-25a3 3 0 0 1 3-3Z",
    fold: "M21.5 .5V5A1.5 1.5 0 0 0 23 6.5h4.5",
    lines: "M11 21h10M11 25.5h10",
  },
} as const;

/** A letra A da nota de texto, desenhada a traço na grade de 24 dos ícones do lucide. */
function LetterGlyph() {
  return (
    <svg className={styles.glyph} data-glyph="letter" aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4.5 20 7.5-16 7.5 16" />
      <path d="M7.3 14h9.4" />
    </svg>
  );
}

/**
 * A nota como folha: onde a tarefa é um quadrado com o ícone no meio, a nota é
 * uma folha com o canto dobrado em volta do ícone do tipo, que fica menor, no
 * canto de cima à esquerda, com dois traços de texto embaixo. A nota de texto,
 * que não tem ícone de tipo, leva a letra A no lugar dele. `list` é a da lista
 * de notas, do tamanho do quadrado da tarefa; `cite` é a compacta, para a nota
 * citada dentro de uma tarefa ou de uma tarefa.
 */
export function NoteSheet({ type, size = "list", className }: { type: string; size?: keyof typeof SHEETS; className?: string }) {
  const sheet = SHEETS[size];
  const Icon = noteTypeIcon(type);
  const isText = Icon === FileText;
  return (
    <span className={className ? `${styles.sheet} ${className}` : styles.sheet} data-size={size} data-note-type={type} aria-hidden>
      <svg className={styles.outline} aria-hidden viewBox={`0 0 ${sheet.box} ${sheet.box}`} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={sheet.outline} />
        <path d={sheet.fold} />
        <path className={styles.lines} d={sheet.lines} />
      </svg>
      {isText ? <LetterGlyph /> : <Icon className={styles.glyph} />}
    </span>
  );
}
