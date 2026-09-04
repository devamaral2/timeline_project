/**
 * O logger do servico, injetavel de proposito.
 *
 * O `Logger` do Nest escreve direto no stdout do processo e escapa do `silent`
 * do Vitest -- o `AGENTS.md` do monorepo ja documenta esse tropeço em
 * `apps/api`, onde o `DomainExceptionFilter` passou a receber o logger pelo
 * construtor pelo mesmo motivo. Sem essa costura, um unico teste de erro suja a
 * saida que o `test:ai` promete manter limpa.
 *
 * O evento chega aqui **ja redigido**: quem constroi decide o que e seguro
 * registrar. Este contrato nao filtra nada.
 */
export interface AuthLogEvent {
  correlationId: string;
  status: number;
  error: string;
  reason?: string;
  message?: string;
}

export abstract class AuthLogger {
  abstract error(event: AuthLogEvent): void;
}

export class ConsoleAuthLogger extends AuthLogger {
  error(event: AuthLogEvent): void {
    process.stderr.write(`${JSON.stringify({ level: "error", ...event })}\n`);
  }
}

/** Para testes: o evento e guardado, nunca impresso. */
export class RecordingAuthLogger extends AuthLogger {
  readonly events: AuthLogEvent[] = [];
  error(event: AuthLogEvent): void { this.events.push(event); }
}
