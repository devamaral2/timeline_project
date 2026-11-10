"use client";

import { type CSSProperties, useEffect, useId, useRef, useState } from "react";
import { OptionsGlyph } from "@/components/ui/options-glyph";
import styles from "./agenda.module.css";

export type AgendaViewMode = "list" | "day";

/**
 * O botão "Opções de visualização" e o seu painel. No celular ele também troca
 * o modo de leitura (`withModes`), num seletor de duas posições cuja pílula
 * desliza até a escolhida; no desktop o modo fica nas pílulas ao lado e o
 * painel guarda só o que vale para a lista, como a chave do tempo livre.
 */
export function AgendaOptions({ mode, onModeChange, showFreeTime, onShowFreeTimeChange, withModes = false, align = "start" }: {
  mode: AgendaViewMode;
  onModeChange: (mode: AgendaViewMode) => void;
  showFreeTime: boolean;
  onShowFreeTimeChange: (show: boolean) => void;
  withModes?: boolean;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();

  // Fecha ao clicar fora ou com Esc, devolvendo o foco ao botão.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);


  return (
    <div ref={rootRef} className={styles.options} data-align={align}>
      <button ref={buttonRef} type="button" className={styles.optionsButton} aria-label="Opções de visualização" title="Opções de visualização" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <OptionsGlyph />
      </button>
      {open ? (
        <div role="dialog" aria-label="Opções de visualização" className={styles.optionsPanel}>
          {withModes ? (
            <>
              <p className={styles.optionsLabel}>Visualização</p>
              {/* O painel fica aberto ao trocar, para a pílula ser vista deslizando. */}
              <fieldset className={styles.optionsModes} aria-label="Visualização" style={{ "--segment-index": mode === "day" ? 0 : 1 } as CSSProperties}>
                <button type="button" className={styles.optionsMode} aria-pressed={mode === "day"} onClick={() => onModeChange("day")}>Por dia</button>
                <button type="button" className={styles.optionsMode} aria-pressed={mode === "list"} onClick={() => onModeChange("list")}>Em sequência</button>
              </fieldset>
            </>
          ) : null}
          <p className={styles.optionsLabel}>Na lista</p>
          <div className={styles.optionsRow}>
            <span id={labelId} className={styles.optionsText}><strong>Tempo livre</strong><small>Janelas de 15 min ou mais entre os eventos</small></span>
            <button type="button" role="switch" aria-checked={showFreeTime} aria-labelledby={labelId} className={styles.optionsSwitch} onClick={() => onShowFreeTimeChange(!showFreeTime)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
