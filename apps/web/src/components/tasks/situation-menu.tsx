import type { TaskSituation } from "@repo/contracts";
import { TASK_SITUATIONS, situationNames } from "./task-situation";
import styles from "./situation-menu.module.css";

/**
 * As três opções de situação, em pílulas na própria linha (a lista) ou sob o cabeçalho (o detalhe). A atual vem
 * marcada; escolher qualquer uma, inclusive a atual, avisa quem usa. Qualquer situação vale a partir de qualquer outra.
 */
export function SituationMenu({ value, onPick, disabled }: { value: TaskSituation; onPick: (situation: TaskSituation) => void; disabled?: boolean }) {
  return (
    <div role="group" aria-label="Situação da tarefa" className={styles.menu}>
      {TASK_SITUATIONS.map((situation) => (
        <button
          key={situation}
          type="button"
          className={styles.pill}
          aria-pressed={situation === value}
          disabled={disabled}
          onClick={() => onPick(situation)}
        >
          {situationNames[situation]}
        </button>
      ))}
    </div>
  );
}
