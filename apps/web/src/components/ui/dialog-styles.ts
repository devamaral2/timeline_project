/**
 * A moldura dos modais — o mesmo painel em todos eles.
 *
 * Os quatro dialogos (novo evento, detalhes, edicao, exclusao) repetiam a
 * mesma sequencia de classes; qualquer ajuste no acabamento tinha que ser
 * feito quatro vezes, e um deles sempre ficava para tras.
 */

/** O fundo que apaga a timeline atras do dialogo. */
export const dialogOverlayClass =
  "fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 p-4 py-8 backdrop-blur-md duration-200 animate-in fade-in";

/** O painel. A largura fica com quem usa (`max-w-md`, `max-w-sm`). */
export const dialogPanelClass =
  "relative flex max-h-[calc(100dvh-4rem)] w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card-hover duration-200 animate-in fade-in zoom-in-95 slide-in-from-bottom-2";

/** Cabecalho e rodape do painel, separados por uma linha da mesma borda. */
export const dialogHeaderClass =
  "flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6";

export const dialogFooterClass =
  "flex shrink-0 items-center justify-end gap-3 border-t border-border px-5 py-4 sm:px-6";

export const dialogTitleClass = "text-lg font-semibold tracking-tight text-foreground";
