"use client";

import type { ModelEffort, ModelOptionsDto, ModelProvider, ModelSelection } from "@repo/contracts";
import { type CSSProperties, type Ref, useEffect, useId, useRef } from "react";
import { EFFORT_LABELS, modelName, providerName, providerOf } from "@/lib/agent-chat/model-selection";
import styles from "./model-picker.module.css";

/**
 * O seletor do modo modelo (canvas "Provedor, modelo e esforço", opção B · Gaveta): o botão no pé do campo, com as
 * quatro barras do esforço e o modelo escolhido, e o painel que cresce do próprio campo. O painel e o botão moram
 * em pontos diferentes do campo; quem os monta guarda se está aberto.
 */

const BAR_COUNT = 4;

interface ModelPickerButtonProps {
  options: ModelOptionsDto;
  selection: ModelSelection;
  open: boolean;
  panelId: string;
  onToggle: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}

export function ModelPickerButton({ options, selection, open, panelId, onToggle, buttonRef }: ModelPickerButtonProps) {
  const name = modelName(options, selection);
  const effort = EFFORT_LABELS[selection.effort];
  const level = Math.max(0, options.efforts.indexOf(selection.effort)) + 1;
  return (
    <button
      type="button"
      ref={buttonRef}
      className={styles.picker}
      aria-label={`Modelo ${name}, esforço ${effort.toLowerCase()}, via ${providerName(options, selection.provider)}. Trocar`}
      aria-expanded={open}
      aria-controls={panelId}
      data-open={open}
      onClick={onToggle}
    >
      <span className={styles.bars} aria-hidden>
        {Array.from({ length: BAR_COUNT }, (_, index) => (
          <span key={index} data-on={index < level} />
        ))}
      </span>
      <span className={styles.pickerText} aria-hidden>
        <span className={styles.pickerModel}>{name} · {effort}</span>
        <span className={styles.pickerVia}>via {selection.provider}</span>
      </span>
    </button>
  );
}

interface ModelPanelProps {
  id: string;
  open: boolean;
  options: ModelOptionsDto;
  selection: ModelSelection;
  onProvider: (provider: ModelProvider) => void;
  onModel: (model: string) => void;
  onEffort: (effort: ModelEffort) => void;
  onDone: () => void;
}

/** O painel da escolha: abre pelo topo do campo, empurrando-o para cima. Fechado, não recebe foco nem é lido. */
export function ModelPanel({ id, open, options, selection, onProvider, onModel, onEffort, onDone }: ModelPanelProps) {
  const titles = useId();
  const providers = options.providers;
  const current = providerOf(options, selection.provider);
  const efforts = options.efforts;
  const level = Math.max(0, efforts.indexOf(selection.effort));
  const step = 100 / Math.max(1, efforts.length);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Aberto, o foco vai para a escolha atual do provedor: o painel fica antes do campo e o teclado chega nele.
  useEffect(() => {
    if (open) bodyRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
  }, [open]);

  return (
    <div id={id} className={styles.panel} data-open={open} aria-hidden={!open} inert={!open}>
      <div className={styles.clip}>
        <div className={styles.body} ref={bodyRef}>
          <div className={styles.block} role="group" aria-labelledby={`${titles}-provider`}>
            <h3 id={`${titles}-provider`} className={styles.title}>Provedor</h3>
            <div className={styles.providers} style={{ gridTemplateColumns: `repeat(${Math.min(3, providers.length)}, minmax(0, 1fr))` }}>
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  className={styles.tile}
                  aria-pressed={provider.id === selection.provider}
                  onClick={() => onProvider(provider.id)}
                >
                  <span className={styles.name}>{provider.name}</span>
                  <span className={styles.radio} aria-hidden />
                </button>
              ))}
            </div>
          </div>

          <div className={styles.block} role="group" aria-labelledby={`${titles}-model`}>
            <h3 id={`${titles}-model`} className={styles.title}>Modelo</h3>
            <div className={styles.models}>
              {(current?.models ?? []).map((model) => (
                <button
                  key={model.id}
                  type="button"
                  className={styles.row}
                  aria-pressed={model.id === selection.model}
                  onClick={() => onModel(model.id)}
                >
                  <span className={styles.name}>{model.name}</span>
                  <span className={styles.radio} aria-hidden />
                </button>
              ))}
            </div>
          </div>

          <div className={styles.block} role="group" aria-labelledby={`${titles}-effort`}>
            <h3 id={`${titles}-effort`} className={styles.title}>Esforço</h3>
            <div className={styles.effort} style={{ "--step": `${step}%`, "--level": level } as CSSProperties}>
              <span className={styles.track} aria-hidden>
                <span className={styles.fill} />
              </span>
              {efforts.map((effort, index) => (
                <button
                  key={effort}
                  type="button"
                  className={styles.stop}
                  aria-pressed={effort === selection.effort}
                  data-passed={index <= level}
                  onClick={() => onEffort(effort)}
                >
                  <span className={styles.dot} aria-hidden />
                  <span className={styles.stopLabel}>{EFFORT_LABELS[effort]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.block}>
            <button type="button" className={styles.done} onClick={onDone}>Selecionar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** O rodapé de uma resposta do modo modelo: "sonnet 5.5 · médio · anthropic". */
export function ModelFooter({ text }: { text: string }) {
  return <div className={styles.answerModel}>{text}</div>;
}
