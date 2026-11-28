import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Response } from "express";
import { Logger, type LogSink } from "../common/logger";
import { httpStatusFor } from "../common/http-status";

/**
 * Adapter temporario do Nest para o error handler da API. A traducao de erro
 * para status mora em `httpStatusFor`, independente do transporte; aqui fica
 * so o que o Express/Nest precisa: escrever `{ error }` e logar no nivel certo.
 *
 * Erro inesperado (banco fora do ar, bug) responde 500, e nao mais 401: o 401
 * antigo fazia o front tratar falha de infraestrutura como sessao expirada.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  /** Injetavel para que os testes possam silenciar a saida: o Logger escreve
   *  direto no console e escaparia do `silent` do Vitest. */
  constructor(private readonly logger: LogSink = new Logger(DomainExceptionFilter.name)) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const message = exception instanceof Error ? exception.message : "Invalid request";
    const status = exception instanceof HttpException ? exception.getStatus() : httpStatusFor(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(message, exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.warn(`${status} — ${message}`);
    }

    response.status(status).json({ error: message });
  }
}
