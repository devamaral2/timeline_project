import type { ModelSelection } from "@repo/contracts";
import { getServerEnv } from "../../config/env";
import { modelOptions } from "./model-catalog";

/**
 * O dono que as ferramentas da agenda representam (ADR 0019). As ferramentas agem sempre como o dono do MCP, entao
 * so ficam ligadas com o token do MCP e com o dono conhecido; e so ele usa o modo modelo enquanto elas estao ligadas.
 */
export function modelAgendaOwner(): string | undefined {
  const env = getServerEnv();
  return env.MCP_URL && env.MCP_TOKEN && env.MCP_OWNER_USER_ID ? env.MCP_OWNER_USER_ID : undefined;
}

/**
 * O modelo que responde um pedido de configuracao que o JEV de entrada manda ao modo modelo: a escolha padrao deste
 * ambiente. Nada sem nenhuma chave de provedor, ou quando as ferramentas da agenda estao ligadas e o usuario nao e o
 * dono delas (a mesma regra de `POST /api/requests/model`).
 */
export async function configModelFor(userId: string): Promise<ModelSelection | undefined> {
  const owner = modelAgendaOwner();
  if (owner !== undefined && userId !== owner) return undefined;
  return (await modelOptions())?.default;
}
