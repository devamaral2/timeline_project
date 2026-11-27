/** O texto de um erro para o log: a mensagem dele, ou o próprio valor lançado. */
export const errorMessage = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));
