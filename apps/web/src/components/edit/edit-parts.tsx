"use client";

import { Check, ChevronDown, Plus, X } from "lucide-react";
import { type ReactNode, type Ref, useId, useRef, useState } from "react";
import { detailStyles } from "@/components/detail/detail-parts";
import styles from "./edit.module.css";
import { OptionList, Popover } from "./popover";

/** O topo do modo de edição: só o rótulo ("Editar evento", "Novo artefato"), sem botões. */
export function EditBar({ children }: { children: ReactNode }) {
  return (
    <header className={styles.bar}>
      <h1 className={styles.barTitle}>{children}</h1>
    </header>
  );
}

/**
 * Uma seção que é um campo só (a descrição, o texto do alimento): o mesmo rótulo em mono com o fio das outras
 * seções, e o título nomeia o campo (`aria-labelledby={labelId}` no controle). Não é uma região nomeada, para o
 * nome ficar só com o campo.
 */
export function EditFieldSection({ title, labelId, children }: { title: string; labelId: string; children: ReactNode }) {
  return (
    <div className={detailStyles.section}>
      <div className={detailStyles.sectionHead}><h2 className={detailStyles.label} id={labelId}>{title}</h2></div>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  );
}

interface EditRowProps {
  /** O rótulo visível, à esquerda. Com `htmlFor`, é o `<label>` do controle. */
  label: string;
  htmlFor?: string;
  /** A linha cinza sob o controle (o fuso, desde quando a série vale). */
  hint?: ReactNode;
  error?: string;
  /** O id do parágrafo de erro, para o `aria-describedby` do controle. */
  errorId?: string;
  children: ReactNode;
}

/** Uma linha de "Informações": o rótulo de 96 px e, ao lado, o controle com a dica e o erro embaixo. */
export function EditRow({ label, htmlFor, hint, error, errorId, children }: EditRowProps) {
  return (
    <div className={styles.row}>
      {htmlFor ? <label htmlFor={htmlFor} className={styles.rowLabel}>{label}</label> : <div className={styles.rowLabel}>{label}</div>}
      <div className={styles.rowBody}>
        {children}
        {hint ? <p className={styles.hint}>{hint}</p> : null}
        {error ? <p id={errorId} className={styles.error}>{error}</p> : null}
      </div>
    </div>
  );
}

interface EditSelectProps<T extends string> {
  id?: string;
  /** O nome do campo para o leitor de tela e para os testes ("Tipo", "Status"). */
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  /** Com moldura de pílula (o tipo) ou solto na linha (status e prioridade). */
  pill?: boolean;
  /** Uma pílula de 48 px que ocupa o campo, como a data: mostra o nome da opção e a seta. */
  control?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onChange: (value: T) => void;
  /** O desenho do valor atual: ícone e texto. É decorativo; quem fala é o nome e o valor do botão. */
  children?: ReactNode;
}

/**
 * Uma escolha desenhada como no quadro (ícone, nome e a seta). Toca, abre uma lista nossa, do tema, embaixo do botão
 * (no celular, uma folha do pé) e escolher fecha e devolve o foco. É um `combobox` de seleção: o teclado abre com
 * Enter, espaço ou seta para baixo, e a lista anda com as setas. Não usa o `<select>` do sistema, cuja lista não
 * pega as cores do tema.
 */
export function EditSelect<T extends string>({ id, label, value, options, pill = false, control = false, invalid = false, describedBy, onChange, children }: EditSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const uid = useId();
  const current = options.find((option) => option.value === value);

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        // biome-ignore lint/a11y/useSemanticElements: é o combobox de seleção do ARIA 1.2; o <select> do sistema abre uma lista que o tema não alcança.
        role="combobox"
        className={styles.select}
        data-pill={pill || undefined}
        data-control={control || undefined}
        data-invalid={invalid || undefined}
        data-value={value}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${uid}-label ${uid}-value`}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onClick={() => setOpen((now) => !now)}
        onKeyDown={(key) => {
          if (key.key !== "ArrowDown" && key.key !== "ArrowUp") return;
          key.preventDefault();
          setOpen(true);
        }}
      >
        <span id={`${uid}-label`} className={styles.srOnly}>{label}</span>
        <span id={`${uid}-value`} className={styles.srOnly}>{current?.label}</span>
        <span aria-hidden style={{ display: "contents" }}>
          {children ?? (
            <>
              <span className={styles.controlText}>{current?.label}</span>
              <EditCaret />
            </>
          )}
        </span>
      </button>
      {open ? (
        <Popover anchor={buttonRef} label={label} matchWidth onClose={() => setOpen(false)}>
          <OptionList
            label={label}
            options={options}
            value={value}
            autoFocus
            onPick={(next) => {
              onChange(next);
              setOpen(false);
              buttonRef.current?.focus();
            }}
          />
        </Popover>
      ) : null}
    </>
  );
}

/** A seta de uma escolha, ao lado do nome. */
export function EditCaret() {
  return <ChevronDown className={styles.caret} aria-hidden />;
}

/** O "+" redondo que acrescenta um item a uma lista (lembrete) ou abre o modal de seleção. */
export function AddButton({ label, onClick, buttonRef }: { label: string; onClick: () => void; buttonRef?: Ref<HTMLButtonElement> }) {
  return (
    <button type="button" ref={buttonRef} className={styles.add} aria-label={label} onClick={onClick}>
      <Plus className={styles.addIcon} aria-hidden />
    </button>
  );
}

/** O "x" que tira um item da lista. A gravação fica para o Salvar. */
export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.remove} aria-label={label} onClick={onClick}>
      <X className={styles.removeIcon} aria-hidden />
    </button>
  );
}

/** O rodapé do modo de edição: só Descartar e Salvar, presos ao pé da tela. */
export function EditFooter({ saving, onDiscard }: { saving: boolean; onDiscard: () => void }) {
  return (
    <footer className={styles.footer}>
      <button type="button" className={styles.footerButton} onClick={onDiscard}>Descartar</button>
      <button type="submit" className={styles.footerButton} data-primary disabled={saving}>
        <Check className={styles.footerIcon} aria-hidden />
        {saving ? "Salvando…" : "Salvar"}
      </button>
    </footer>
  );
}

export { styles as editStyles };
