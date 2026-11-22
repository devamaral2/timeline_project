import { getServerEnv } from "../../config/env";

/**
 * O dono que as ferramentas da agenda representam (ADR 0019). As ferramentas agem sempre como o dono do MCP, entao
 * so ficam ligadas com o token do MCP e com o dono conhecido; e so ele usa o modo modelo enquanto elas estao ligadas.
 */
export function modelAgendaOwner(): string | undefined {
  const env = getServerEnv();
  return env.MCP_URL && env.MCP_TOKEN && env.MCP_OWNER_USER_ID ? env.MCP_OWNER_USER_ID : undefined;
}
