"use client";

import type { ModelOptionsDto, ModelSelection } from "@repo/contracts";
import { Search, Star, X } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, type RefObject, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useKeyboardViewport } from "@/components/shell/use-keyboard-viewport";
import { type ModelTab, modelRows } from "@/lib/agent-chat/model-favorites";
import { EFFORT_LABELS, providerName } from "@/lib/agent-chat/model-selection";
import type { ModelSelectionControls } from "@/lib/agent-chat/model-selection-store";
import styles from "./model-picker.module.css";
import { ProviderMark } from "./provider-marks";

/**
 * A escolha do modelo nos campos do Hermes (canvas "Modal de provedor, modelo e esforço", opção A · Folha): uma folha
 * por cima da tela, que sobe do pé. O campo não mostra o modelo (canvas
 * "Input do detalhe da entidade"): a folha abre quando se envia `/model` (`isModelCommand`). `useModelPicker` guarda
 * se está aberta e o `HermesComposer` a monta.
 */

/** A escolha de um campo: o que o servidor oferece, se a folha está aberta e como abri-la, fechá-la e trocar a escolha. */
export interface ModelPickerState {
  /** O que o servidor oferece e a escolha atual; `null` quando não há o que escolher (o `/model` não abre nada). */
  choice: { options: ModelOptionsDto; selection: ModelSelection } | null;
  open: boolean;
  /** Aberta, e ainda enquanto a folha desce: ela segue montada até a saída acabar. */
  mounted: boolean;
  /** Abre a folha (o `/model`). */
  show: () => void;
  /** Fecha a folha e devolve o foco ao texto do campo. */
  close: () => void;
  panelId: string;
  controls: ModelSelectionControls;
}

/**
 * A escolha de um campo. Lê as opções do servidor quando o campo aparece; `hidden` a tira onde ela não vale (o modo
 * Hermes). Sem o modo modelo neste ambiente, `choice` é `null`. `returnFocus` é o texto do campo, que recebe o foco
 * quando a folha fecha.
 */
export function useModelPicker(
  controls: ModelSelectionControls,
  { hidden = false, returnFocus }: { hidden?: boolean; returnFocus: RefObject<HTMLElement | null> },
): ModelPickerState {
  const [open, setOpen] = useState(false);
  // Segue verdadeiro por `CLOSE_MS` depois de fechar: o tempo de a folha descer.
  const [present, setPresent] = useState(false);
  const panelId = useId();
  const { options, selection, load } = controls;
  const choice = useMemo(() => (!hidden && options && selection ? { options, selection } : null), [hidden, options, selection]);
  const shown = choice !== null;

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!shown) setOpen(false);
  }, [shown]);
  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    const settle = window.setTimeout(() => setPresent(false), CLOSE_MS);
    return () => window.clearTimeout(settle);
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    returnFocus.current?.focus();
  }, [returnFocus]);
  const show = useCallback(() => setOpen(true), []);
  // Escape fecha a folha e devolve o foco ao texto do campo.
  useEffect(() => {
    if (!open) return;
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [open, close]);

  return { choice, open, mounted: open || present, show, close, panelId, controls };
}

/** Quanto a folha segue montada depois de fechar: os 300ms da descida (na folha de estilo) e uma folga de quadros. */
const CLOSE_MS = 340;

const FAVORITES_NAME = "Favoritos";

/**
 * A folha da escolha, montada no `<body>` só enquanto está aberta ou saindo. Cada abertura começa na aba do provedor
 * da escolha atual e com a busca vazia, mesmo quando a folha reabre antes de a saída acabar.
 */
export function ModelSheet({ picker }: { picker: ModelPickerState }) {
  if (!picker.choice || !picker.mounted) return null;
  return <Sheet picker={picker} options={picker.choice.options} selection={picker.choice.selection} />;
}

function Sheet({ picker, options, selection }: { picker: ModelPickerState; options: ModelOptionsDto; selection: ModelSelection }) {
  const { open, close, controls } = picker;
  const titles = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  // A aba é só o que a lista mostra: trocar de aba não troca a escolha.
  const [tab, setTab] = useState<ModelTab>(selection.provider);
  const [query, setQuery] = useState("");
  const efforts = options.efforts;
  const level = Math.max(0, efforts.indexOf(selection.effort));
  const step = 100 / Math.max(1, efforts.length);
  const { favorites } = controls;
  const rows = useMemo(() => modelRows(options, favorites, selection, tab, query), [options, favorites, selection, tab, query]);
  const tabName = tab === "favorites" ? FAVORITES_NAME : providerName(options, tab);

  // Com o teclado aberto (a busca), a folha fica acima dele e o esforço sai, para os resultados aparecerem.
  useKeyboardViewport(overlayRef, true);

  // A página de trás não rola enquanto a folha está na tela.
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a aba e a busca voltam ao começo a cada abertura, não a cada troca da escolha.
  useEffect(() => {
    if (!open) return;
    setTab(selection.provider);
    setQuery("");
  }, [open]);

  // Ao abrir, o foco entra na folha pela aba aberta, e o modelo escolhido aparece sem rolar a lista à mão.
  useEffect(() => {
    if (!open) return;
    sheetRef.current?.querySelector<HTMLElement>('[data-model-tab][aria-pressed="true"]')?.focus({ preventScroll: true });
    sheetRef.current?.querySelector<HTMLElement>('[data-model-row][aria-pressed="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [open]);

  function openTab(next: ModelTab) {
    setTab(next);
    // A busca vale para a lista aberta agora.
    setQuery("");
  }

  /** Tab dá a volta dentro da folha (o Escape é do `useModelPicker`). */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const stops = [...(sheetRef.current?.querySelectorAll<HTMLElement>("button, input") ?? [])];
    const first = stops[0];
    const last = stops.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    // O toque fora fecha.
    <div
      ref={overlayRef}
      className={styles.overlay}
      data-model-sheet
      data-open={open}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={sheetRef}
        id={picker.panelId}
        role="dialog"
        aria-modal="true"
        aria-label="Escolha do modelo"
        aria-hidden={!open}
        inert={!open}
        className={styles.sheet}
        onKeyDown={onKeyDown}
      >
        <span className={styles.handle} aria-hidden />

        <fieldset className={styles.block} data-block="provider" aria-labelledby={`${titles}-provider`}>
          <div className={styles.head}>
            <div className={styles.headText}>
              <h3 id={`${titles}-provider`} className={styles.title}>Provedor</h3>
              <span className={styles.tabName}>{tabName}</span>
            </div>
            <button type="button" className={styles.close} aria-label="Fechar" onClick={close}>
              <X aria-hidden />
            </button>
          </div>
          <div className={styles.tiles}>
            <button type="button" className={styles.tile} data-model-tab aria-label={FAVORITES_NAME} aria-pressed={tab === "favorites"} onClick={() => openTab("favorites")}>
              <Star className={styles.tileStar} aria-hidden />
            </button>
            {options.providers.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className={styles.tile}
                data-model-tab
                aria-label={provider.name}
                aria-pressed={tab === provider.id}
                onClick={() => openTab(provider.id)}
              >
                <ProviderMark provider={provider.id} />
              </button>
            ))}
          </div>
        </fieldset>

        {/* Um `div` e não um `fieldset`: o navegador não encolhe os filhos flex de um fieldset que cedeu altura, e é a
            lista deste bloco que encolhe quando a tela é curta. */}
        {/* biome-ignore lint/a11y/useSemanticElements: o fieldset não deixa a lista encolher (acima). */}
        <div role="group" className={styles.block} data-block="models" aria-labelledby={`${titles}-model`}>
          <h3 id={`${titles}-model`} className={styles.title}>Modelos</h3>
          <label className={styles.search}>
            <Search aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar modelo"
              aria-label="Buscar modelo"
              autoComplete="off"
              enterKeyHint="search"
            />
            {query ? (
              <button type="button" className={styles.clear} aria-label="Limpar a busca" onClick={() => setQuery("")}>
                <X aria-hidden />
              </button>
            ) : null}
          </label>
          <div className={styles.models}>
            {rows.map((row) => (
              <div key={`${row.provider}:${row.id}`} className={styles.row}>
                <button
                  type="button"
                  className={styles.pick}
                  data-model-row
                  aria-label={tab === "favorites" ? `${row.name}, ${providerName(options, row.provider)}` : undefined}
                  aria-pressed={row.selected}
                  onClick={() => controls.chooseModel(row.id, row.provider)}
                >
                  <span className={styles.radio} aria-hidden />
                  <span className={styles.name}>{row.name}</span>
                  {tab === "favorites" ? <span className={styles.via}>{row.provider}</span> : null}
                </button>
                <button
                  type="button"
                  className={styles.star}
                  aria-label={`${row.favorite ? "Tirar dos favoritos" : "Favoritar"}: ${row.name}`}
                  aria-pressed={row.favorite}
                  onClick={() => controls.toggleFavorite(row.provider, row.id)}
                >
                  <Star aria-hidden />
                </button>
              </div>
            ))}
            {rows.length === 0 ? (
              <p className={styles.empty}>
                {query.trim() ? "Nenhum modelo com esse nome." : tab === "favorites"
                  ? "Nenhum favorito ainda. Toque na estrela de um modelo para guardá-lo aqui."
                  : "Nenhum modelo neste provedor."}
              </p>
            ) : null}
          </div>
        </div>

        <fieldset className={styles.block} data-block="effort" aria-labelledby={`${titles}-effort`}>
          <h3 id={`${titles}-effort`} className={styles.title}>Esforço</h3>
          <div className={styles.effort} style={{ "--step": `${step}%`, "--level": level, "--last": Math.max(1, efforts.length - 1) } as CSSProperties}>
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
                onClick={() => controls.chooseEffort(effort)}
              >
                <span className={styles.dot} aria-hidden />
                <span className={styles.stopLabel}>{EFFORT_LABELS[effort]}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </div>,
    document.body,
  );
}

/** O rodapé de uma resposta do modo modelo: "sonnet 5.5 · médio · anthropic". */
export function ModelFooter({ text }: { text: string }) {
  return <div className={styles.answerModel}>{text}</div>;
}
