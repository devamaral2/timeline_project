export interface LogSink {
  warn(message: string): void;
  error(message: string, trace?: string): void;
}

/**
 * Logger da aplicacao, sem o Nest. Mantem os mesmos niveis e canais do
 * ConsoleLogger que usavamos: `log` no stdout; `warn` e `error` no stderr.
 * O contexto entre colchetes e o nome do componente, como antes.
 */
export class Logger implements LogSink {
  constructor(private readonly context?: string) {}

  log(message: unknown, ...rest: unknown[]): void {
    this.write(console.log, this.line(message), rest);
  }

  warn(message: unknown, ...rest: unknown[]): void {
    this.write(console.warn, this.line(message), rest);
  }

  error(message: unknown, ...rest: unknown[]): void {
    this.write(console.error, this.line(message), rest);
  }

  debug(message: unknown, ...rest: unknown[]): void {
    this.write(console.debug, this.line(message), rest);
  }

  verbose(message: unknown, ...rest: unknown[]): void {
    this.write(console.debug, this.line(message), rest);
  }

  fatal(message: unknown, ...rest: unknown[]): void {
    this.write(console.error, this.line(message), rest);
  }

  private line(message: unknown): string {
    const text = typeof message === "string" ? message : String(message);
    return this.context ? `[${this.context}] ${text}` : text;
  }

  private write(channel: (...data: unknown[]) => void, message: string, rest: unknown[]): void {
    channel(message, ...rest);
  }
}
