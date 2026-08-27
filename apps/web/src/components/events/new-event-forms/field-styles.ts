export const fieldInputClass =
  "h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary";

export const fieldTextareaClass =
  "resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary";

export const fieldLabelClass = "text-[13px] font-medium text-foreground";

/**
 * `type="number"` valida o valor contra `step` (1 por padrao), entao qualquer
 * decimal — ate os que ja vieram salvos no evento — invalida o campo e trava o
 * submit do form. `any` desliga essa checagem e mantem o teclado numerico.
 */
export const anyDecimalStep = "any";
