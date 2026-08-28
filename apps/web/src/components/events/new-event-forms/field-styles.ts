/**
 * Campos de formulario do design system: superficie afundada no fundo escuro,
 * borda discreta e um anel da cor da marca quando o campo esta em foco.
 *
 * `fieldSurface` nao define tamanho de texto de proposito — quem compoe e que
 * decide, e assim `text-sm` e `text-[13px]` nunca aparecem juntos na mesma
 * classe brigando por precedencia.
 */
const fieldSurface =
  "rounded-lg border border-input bg-background/60 text-foreground outline-none transition-all placeholder:text-muted-foreground/70 focus:border-brand focus:ring-2 focus:ring-brand/25";

export const fieldInputClass = `${fieldSurface} h-11 px-3 text-sm`;

export const fieldTextareaClass = `${fieldSurface} resize-none px-3 py-2 text-sm`;

/** A versao compacta, das linhas de exercicio e de alimento. */
export const smallInputClass = `${fieldSurface} h-9 px-2.5 text-[13px]`;

export const fieldLabelClass = "text-[13px] font-medium text-foreground";

/** O botao tracejado que adiciona mais uma linha a uma lista do formulario. */
export const addRowButtonClass =
  "inline-flex items-center justify-center gap-1.5 self-start rounded-lg border border-dashed border-border px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:border-brand/45 hover:text-foreground";

/** O aviso de lista vazia, na mesma moldura tracejada do botao acima. */
export const emptyRowClass =
  "rounded-lg border border-dashed border-border px-3 py-4 text-center text-[13px] text-muted-foreground";

/** Link de texto dentro do formulario ("adicionar interrupcao"). */
export const inlineLinkClass =
  "inline-flex items-center gap-1 self-start text-[12.5px] font-medium text-brand-accent hover:underline";

/**
 * `type="number"` valida o valor contra `step` (1 por padrao), entao qualquer
 * decimal — ate os que ja vieram salvos no evento — invalida o campo e trava o
 * submit do form. `any` desliga essa checagem e mantem o teclado numerico.
 */
export const anyDecimalStep = "any";
