"use client";

import type { ReactNode } from "react";
import styles from "@/components/detail/entity-ai-edit-bar.module.css";
import { ModelPanel, ModelPickerButton, type ModelPickerState } from "@/components/hub/model-picker";
import picker from "@/components/hub/model-picker.module.css";

interface HermesComposerProps {
  /** O seletor de modelo do campo (`useModelPicker`). */
  model: ModelPickerState;
  onSubmit: () => void;
  /** O que fica acima do texto: o registro aberto, ou a janela livre anexada ao pedido. */
  context?: ReactNode;
  /** A onda que liga a transcrição e a seta de enviar. */
  controls: ReactNode;
  /** O campo de texto. */
  children: ReactNode;
}

/**
 * O cartão do campo do Hermes, um só para o chat e para a edição do detalhe: o painel do seletor de modelo, que
 * cresce do topo do próprio campo, o contexto, o texto e, no pé, o modelo escolhido ao lado da onda e da seta.
 * O pé mostra sempre o modelo, o esforço e o provedor que atendem o pedido, e tocar nele abre o painel. Só fica sem
 * o pé (a onda e a seta sobem para a linha do texto) onde não há escolha: sem provedor com chave neste ambiente.
 */
export function HermesComposer({ model, onSubmit, context, controls, children }: HermesComposerProps) {
  const { choice } = model;
  return (
    <form
      className={styles.form}
      aria-label="Pedido ao Hermes"
      data-model={choice !== null}
      data-model-open={model.open}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {choice ? (
        <ModelPanel
          id={model.panelId}
          open={model.open}
          options={choice.options}
          selection={choice.selection}
          onProvider={model.controls.chooseProvider}
          onModel={model.controls.chooseModel}
          onEffort={model.controls.chooseEffort}
          onDone={model.close}
        />
      ) : null}
      {context}
      <div className={styles.row}>
        {children}
        {choice ? null : controls}
      </div>
      {choice ? (
        <div className={picker.footer}>
          <ModelPickerButton
            options={choice.options}
            selection={choice.selection}
            open={model.open}
            panelId={model.panelId}
            onToggle={model.toggle}
            buttonRef={model.buttonRef}
          />
          {controls}
        </div>
      ) : null}
    </form>
  );
}
