"use client";

import { Check, ChevronDown } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { detailIcon, useDismiss } from "@/components/detail/detail-parts";
import styles from "./event-detail.module.css";

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  icon: ReactNode;
}

interface EventChoiceProps<T extends string> {
  /** O nome que o leitor de tela anuncia no botão, com o valor atual e a ação. */
  ariaLabel: string;
  listLabel: string;
  /** `null` quando o evento não tem o valor (o evento de referência sem status). */
  value: T | null;
  options: ChoiceOption<T>[];
  /** O conteúdo visível do botão, sem o seta. */
  trigger: ReactNode;
  disabled?: boolean;
  onChange: (value: T) => void;
}

/**
 * Uma escolha pequena no topo do evento (status e prioridade): o botão abre a
 * lista, a lista é um `listbox` e fecha com Esc ou toque fora, como no resto das
 * telas de detalhe. Escolher o valor que já está não grava nada.
 */
export function EventChoice<T extends string>({ ariaLabel, listLabel, value, options, trigger, disabled = false, onChange }: EventChoiceProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, ref, () => setOpen(false));

  return (
    <div className={styles.choice} ref={ref}>
      <button
        type="button"
        className={styles.chip}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {trigger}
        <ChevronDown className={styles.caret} {...detailIcon} />
      </button>
      {open ? (
        <EventChoiceList
          listLabel={listLabel}
          value={value}
          options={options}
          onPick={(picked) => {
            setOpen(false);
            if (picked !== value) onChange(picked);
          }}
        />
      ) : null}
    </div>
  );
}

interface EventChoiceListProps<T extends string> {
  listLabel: string;
  /** `null` quando o evento não tem o valor: nenhuma opção fica marcada. */
  value: T | null;
  options: ChoiceOption<T>[];
  /** A classe do quadro da lista; o padrão é o do topo do detalhe (posicionado sob o botão). */
  className?: string;
  /** Recebe a opção tocada, marcada ou não; quem chama decide se grava. */
  onPick: (value: T) => void;
}

/**
 * A lista de opções sozinha (um `listbox`), para quem abre a escolha por outro
 * gatilho: o topo do detalhe usa `EventChoice`, que a põe sob o botão; a agenda
 * a põe num cartão próprio.
 */
export function EventChoiceList<T extends string>({ listLabel, value, options, className = styles.choiceList, onPick }: EventChoiceListProps<T>) {
  return (
    <div role="listbox" aria-label={listLabel} className={className}>
      {options.map((option) => (
        <button key={option.value} type="button" role="option" aria-selected={option.value === value} onClick={() => onPick(option.value)}>
          <span aria-hidden className={styles.glyph}>{option.icon}</span>
          {option.label}
          {option.value === value ? <Check className={styles.selectedMark} {...detailIcon} /> : null}
        </button>
      ))}
    </div>
  );
}
