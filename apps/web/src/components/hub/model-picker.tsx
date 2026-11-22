"use client";

import type { ModelEffort, ModelOptionsDto, ModelProvider, ModelSelection } from "@repo/contracts";
import { type CSSProperties, type Ref, useEffect, useId, useMemo, useRef, useState } from "react";
import { EFFORT_LABELS, modelName, providerName, providerOf } from "@/lib/agent-chat/model-selection";
import styles from "./model-picker.module.css";

/**
 * O seletor do modo modelo (canvas "Provedor, modelo e esforço", opção B · Gaveta): o botão no pé do campo, com as
 * quatro barras do esforço e o modelo escolhido, e o painel que cresce do próprio campo. O painel e o botão moram
 * em pontos diferentes do campo; quem os monta guarda se está aberto.
 */

/** As quatro barras do esforco, da mais baixa a mais alta. */
const BARS = [1, 2, 3, 4] as const;
/** Com mais modelos que isto, a lista ganha a busca. */
const SEARCH_FROM = 6;

/** Sem acento e sem caixa: "gemini" acha "Google: Gemini 4 Neon", e o id (`google/gemini-4-neon`) tambem conta. */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function filterModels<T extends { id: string; name: string }>(models: readonly T[], query: string): readonly T[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return models;
  return models.filter((model) => {
    const haystack = normalize(`${model.name} ${model.id}`);
    return words.every((word) => haystack.includes(word));
  });
}

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
        {BARS.map((bar) => (
          <span key={bar} data-on={bar <= level} />
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
  const [query, setQuery] = useState("");
  const models = current?.models ?? [];
  const shown = useMemo(() => filterModels(models, query), [models, query]);

  // A busca vale para a lista aberta agora: trocar de provedor ou fechar o painel a limpa.
  // biome-ignore lint/correctness/useExhaustiveDependencies: limpa a busca quando o provedor muda ou o painel fecha.
  useEffect(() => {
    setQuery("");
  }, [selection.provider, open]);

  // Aberto, o foco vai para a escolha atual do provedor: o painel fica antes do campo e o teclado chega nele.
  useEffect(() => {
    if (!open) return;
    bodyRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
    // Numa lista longa (OpenRouter), o modelo escolhido aparece sem rolar a mao.
    bodyRef.current?.querySelector<HTMLElement>('[data-model-row][aria-pressed="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [open]);

  return (
    <div id={id} className={styles.panel} data-open={open} data-model-panel aria-hidden={!open} inert={!open}>
      <div className={styles.clip}>
        <div className={styles.body} ref={bodyRef}>
          <fieldset className={styles.block} aria-labelledby={`${titles}-provider`}>
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
          </fieldset>

          <fieldset className={styles.block} aria-labelledby={`${titles}-model`}>
            <h3 id={`${titles}-model`} className={styles.title}>Modelo</h3>
            {models.length > SEARCH_FROM ? (
              <input
                type="search"
                className={styles.search}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar modelo"
                aria-label="Buscar modelo"
                autoComplete="off"
                enterKeyHint="search"
              />
            ) : null}
            <div className={styles.models}>
              {shown.length === 0 ? <p className={styles.empty}>Nenhum modelo encontrado.</p> : null}
              {shown.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  className={styles.row}
                  data-model-row
                  aria-pressed={model.id === selection.model}
                  onClick={() => onModel(model.id)}
                >
                  <span className={styles.name}>{model.name}</span>
                  <span className={styles.radio} aria-hidden />
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.block} aria-labelledby={`${titles}-effort`}>
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
          </fieldset>

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
