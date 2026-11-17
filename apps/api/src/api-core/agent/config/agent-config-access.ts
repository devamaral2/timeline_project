import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { getServerEnv } from "../../../config/env";
import type { AuthenticatedUser } from "../../../http/request-identity/authenticated-user";
import { InvalidInputError } from "../errors/agent.errors";
import { AgentFileNotFoundError } from "./agent-files.service";

/** So o dono, definido em `AGENT_CONFIG_OWNER_USER_ID`, le e altera; sem essa variavel ninguem altera. */
export function assertConfigOwner(actor: AuthenticatedUser): void {
  const owner = getServerEnv().AGENT_CONFIG_OWNER_USER_ID;
  if (!owner || actor.userId !== owner) throw new ForbiddenException("Só o dono altera a configuração do agente.");
}

export function parseConfigInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
  return parsed.data;
}

/** Arquivo ou backup que nao existe vira 404; o resto segue como estava. */
export function configAsNotFound<T>(run: () => Promise<T> | T): Promise<T> {
  return Promise.resolve()
    .then(run)
    .catch((error: unknown) => {
      if (error instanceof AgentFileNotFoundError) throw new NotFoundException(error.message);
      throw error;
    });
}

export const configPath = z.string().min(1).max(300);
