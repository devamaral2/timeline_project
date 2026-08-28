/**
 * As tres formas de botao do design system, em um lugar so.
 *
 * Antes cada componente repetia a mesma sequencia de classes, e o hover de um
 * saia diferente do outro. Aqui a acao principal e a unica coisa da tela
 * preenchida com a cor da marca — e por isso que ela e a principal.
 *
 * Extras (largura, so icone, um `size` diferente) entram por `cn(...)` em cima.
 */

const base =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-60";

/** Acao principal: roxo solido, clareando de leve no hover. */
export const primaryButtonClass = `${base} bg-primary font-semibold text-primary-foreground hover:brightness-110`;

/** Acao secundaria: a borda de sempre, com o fundo acendendo no hover. */
export const outlineButtonClass = `${base} border border-border bg-card/60 font-medium text-foreground hover:bg-accent`;

/** Acao destrutiva. */
export const destructiveButtonClass = `${base} bg-destructive font-semibold text-destructive-foreground hover:brightness-110`;

/** Botao redondo de icone — fechar, remover uma linha de formulario. */
export const iconButtonClass =
  "grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60";
