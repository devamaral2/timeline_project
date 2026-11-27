import { Bot, FileText, Wrench, type LucideIcon } from "lucide-react";
import { visualForItemType } from "@/components/tasks/task-visuals";
import { CompassIcon, MovementIcon } from "@/components/ui/type-icons";
import styles from "./note-sheet.module.css";

/** Os tipos de artefato sem tarefa de mesmo nome: o exercício e os arquivos do Hermes. */
const OWN_ICONS: Record<string, LucideIcon> = { workout: MovementIcon, skill: Wrench, agent: Bot, router: CompassIcon };

/**
 * O ícone de um tipo de artefato, pelo tipo visual (`artifactVisualType`): o do tipo de tarefa na refeição, no
 * treino e no sono, o desenho próprio no exercício e nos arquivos do Hermes, a folha do Lucide no texto.
 */
export function noteTypeIcon(type: string): LucideIcon {
  if (type === "meal" || type === "training" || type === "sleep") return visualForItemType(type).Icon;
  return OWN_ICONS[type] ?? FileText;
}

/**
 * O desenho das páginas em cada tamanho, na caixa quadrada em que elas ficam
 * centradas: a página da frente inteira e, atrás dela, a borda de cima e a da
 * direita de uma segunda página. Os cantos são bem menos
 * arredondados que os do quadrado da tarefa (4 contra 13), para a forma ler
 * como papel. O ícone do tipo é centrado na página da frente pelo CSS.
 */
const SHEETS = {
  list: {
    box: 44,
    front: "M6.5 9.5h22a4 4 0 0 1 4 4v26a4 4 0 0 1-4 4h-22a4 4 0 0 1-4-4v-26a4 4 0 0 1 4-4Z",
    back: "M13 .5h24.5a4 4 0 0 1 4 4v31",
  },
  cite: {
    box: 32,
    front: "M5.5 7.5h15a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3h-15a3 3 0 0 1-3-3v-18a3 3 0 0 1 3-3Z",
    back: "M10 .5h16.5a3 3 0 0 1 3 3v22",
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
 * O artefato como páginas empilhadas: onde a tarefa é um quadrado com o ícone
 * no meio, o artefato são duas páginas com o ícone do tipo no meio da página
 * da frente. A nota de texto, que não tem ícone de tipo, leva a
 * letra A no lugar dele. `list` é a da lista de artefatos, do tamanho do
 * quadrado da tarefa; `cite` é a compacta, para o artefato citado dentro de
 * uma tarefa.
 */
export function NoteSheet({ type, size = "list", className }: { type: string; size?: keyof typeof SHEETS; className?: string }) {
  const sheet = SHEETS[size];
  const Icon = noteTypeIcon(type);
  const isText = Icon === FileText;
  return (
    <span className={className ? `${styles.sheet} ${className}` : styles.sheet} data-size={size} data-note-type={type} aria-hidden>
      <svg className={styles.outline} aria-hidden viewBox={`0 0 ${sheet.box} ${sheet.box}`} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={sheet.front} />
        <path d={sheet.back} />
      </svg>
      {isText ? <LetterGlyph /> : <Icon className={styles.glyph} />}
    </span>
  );
}
