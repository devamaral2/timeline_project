import type { CSSProperties } from "react";
import styles from "./list-skeleton.module.css";

/**
 * As linhas-fantasma de uma lista que ainda não chegou: o quadrado do ícone,
 * duas barras de texto e a figura da direita, pulsando em onda de cima para
 * baixo. `label` é o que o leitor de tela ouve no lugar delas.
 */
export function ListSkeleton({ rows = 5, label }: { rows?: number; label?: string }) {
  return (
    <div className={styles.skeleton} aria-busy="true">
      {label ? <p role="status" className="sr-only">{label}</p> : null}
      {Array.from({ length: rows }, (_, row) => row).map((row) => (
        <div key={row} className={styles.row} style={{ "--row": row } as CSSProperties} aria-hidden="true">
          <span className={styles.tile} />
          <span className={styles.text}><i data-width={row % 3} /><i /></span>
          <span className={styles.figure} />
        </div>
      ))}
    </div>
  );
}
