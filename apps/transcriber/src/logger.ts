export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  /** Um logger que acrescenta `prefix` a toda linha; serve para marcar o pedido. */
  child(prefix: string): Logger;
}

/**
 * Uma linha por fato, em português, sem data (o journal do systemd já a põe). `INFO`, `AVISO` e `ERRO` abrem a
 * linha, e o prefixo do pedido vem depois. Nunca registre a chave de dispositivo.
 */
export function createLogger(write: (line: string) => void = (line) => process.stdout.write(`${line}\n`), prefix = ""): Logger {
  const line = (level: string, message: string) => write(`${level.padEnd(5)} ${prefix}${message}`);
  return {
    info: (message) => line("INFO", message),
    warn: (message) => line("AVISO", message),
    error: (message) => line("ERRO", message),
    child: (extra) => createLogger(write, `${prefix}${extra} `),
  };
}

export function silentLogger(): Logger {
  const logger: Logger = { info() {}, warn() {}, error() {}, child: () => logger };
  return logger;
}
