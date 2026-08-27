import type { ArgumentsHost } from "@nestjs/common";
import { DomainExceptionFilter } from "../../common/domain-exception.filter";

/**
 * Roda o erro pelo `DomainExceptionFilter` de producao e devolve o status que o
 * cliente veria. Assim os testes seguem verificando codigos HTTP, e nao apenas o
 * tipo da excecao — sem precisar subir um servidor.
 */
export function statusOf(error: unknown): number {
  let status = 0;
  const response = {
    status(code: number) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
  const silentLogger = { log() {}, error() {}, warn() {} };

  new DomainExceptionFilter(silentLogger).catch(error, host);
  return status;
}

/** Executa `run` e devolve o status HTTP do erro que ela lancou. */
export async function statusOfThrown(run: () => Promise<unknown>): Promise<number> {
  try {
    await run();
  } catch (error) {
    return statusOf(error);
  }
  throw new Error("esperava que a chamada lancasse um erro");
}
