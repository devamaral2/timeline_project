"use client";

import type { ReactNode } from "react";
import styles from "@/components/detail/entity-ai-edit-bar.module.css";
import { type ModelPickerState, ModelSheet } from "@/components/hub/model-picker";

interface HermesComposerProps {
  /** A escolha do modelo do campo (`useModelPicker`). */
  model: ModelPickerState;
  onSubmit: () => void;
  /** O que fica acima do texto: a janela livre anexada ao pedido. */
  context?: ReactNode;
  /** A onda que liga a transcrição e a seta de enviar. */
  controls: ReactNode;
  /** O campo de texto. */
  children: ReactNode;
}

/**
 * O campo do Hermes, um só para o chat e para a edição do detalhe (canvas "Input do detalhe da entidade"): uma pílula
 * de uma linha com o texto, a onda e a seta, sem nada do modelo à vista. Quem a usa abre a folha da escolha, por
 * cima da tela, quando se envia `/model` (`isModelCommand`); o modelo escolhido vai em todo pedido.
 */
export function HermesComposer({ model, onSubmit, context, controls, children }: HermesComposerProps) {
  return (
    <>
      <form
        className={styles.form}
        aria-label="Pedido ao Hermes"
        data-layout="pill"
        data-model={model.choice !== null}
        data-model-open={model.open}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {context}
        <div className={styles.row}>
          {children}
          {controls}
        </div>
      </form>
      <ModelSheet picker={model} />
    </>
  );
}
