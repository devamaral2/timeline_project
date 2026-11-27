import type { TaskKind, HumanTaskKind } from "@repo/contracts";
import { TypeIconPaths, typeIconNodes } from "@/components/ui/type-icons";
import styles from "./task-glyphs.module.css";

const humanKinds: readonly HumanTaskKind[] = ["common", "meal", "sleep", "training"];

/**
 * O desenho de cada tipo, copiado do quadro Tipos do canvas (traco 2, cantos redondos). Refeicao, sono e treino vem de
 * `components/ui/type-icons.tsx`, os mesmos desenhos dos artefatos desses tipos.
 */
function KindPaths({ kind }: { kind: TaskKind }) {
  switch (kind) {
    case "common":
      return (
        <>
          <path d="M8 2v4" />
          <path d="M16 2v4" />
          <rect width="18" height="18" x="3" y="4" rx="2" />
          <path d="M3 10h18" />
          <path d="m9 16 2 2 4-4" />
        </>
      );
    case "meal":
      return <TypeIconPaths node={typeIconNodes.plate} />;
    case "sleep":
      return <TypeIconPaths node={typeIconNodes.moonStar} />;
    case "training":
      return <TypeIconPaths node={typeIconNodes.barbell} />;
    case "request":
      return <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />;
    case "save_content":
      return <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />;
    case "save_content_with_transcription":
      return (
        <>
          <rect width="20" height="14" x="2" y="5" rx="2" />
          <path d="M7 15h4" />
          <path d="M15 15h2" />
          <path d="M7 11h2" />
          <path d="M13 11h4" />
        </>
      );
    case "search_request":
      return (
        <>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </>
      );
    case "build_request":
      return (
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      );
    case "inquiry_request":
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </>
      );
    case "review_request":
      return (
        <>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      );
    case "cron":
      return (
        <>
          <line x1="10" x2="14" y1="2" y2="2" />
          <line x1="12" x2="15" y1="14" y2="11" />
          <circle cx="12" cy="14" r="8" />
        </>
      );
    case "step":
      return (
        <>
          <path d="m15 10 5 5-5 5" />
          <path d="M4 4v7a4 4 0 0 0 4 4h12" />
        </>
      );
  }
}

/**
 * O ícone do tipo com o código escrito em mono ao lado. O código é o que o
 * leitor de tela anuncia; o ícone é decorativo. Sem cor própria: só o desenho.
 */
export function TaskKindMark({ kind, size = 14, className }: { kind: TaskKind; size?: number; className?: string }) {
  const actor = humanKinds.includes(kind as HumanTaskKind) ? "human" : "agent";

  return (
    <span className={className ?? styles.kindMark} data-kind={kind} data-actor={actor}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={styles.kindIcon}
      >
        <KindPaths kind={kind} />
      </svg>
      <span className={styles.code}>{kind}</span>
    </span>
  );
}
