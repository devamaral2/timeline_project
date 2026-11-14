import type { ReactNode } from "react";
import styles from "./event-edit.module.css";

/**
 * Um campo com rótulo visível e, se houver, a mensagem de erro logo abaixo. O
 * erro fica fora do `<label>`, para o nome acessível do campo continuar só o rótulo.
 * O controle passa `id` igual ao do campo e `aria-describedby` apontando para `${id}-error`.
 */
export function EditField({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      {children}
      {error ? <p id={`${id}-error`} className={styles.error}>{error}</p> : null}
    </div>
  );
}
