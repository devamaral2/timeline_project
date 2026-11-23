import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/** O resultado de uma ferramenta como volta ao modelo: texto, e se a chamada falhou. */
export interface ToolOutcome {
  content: string;
  isError: boolean;
}

/** Uma ferramenta como o MCP a descreve; cada provedor a traduz para o proprio formato. */
export interface AgendaToolSpec {
  name: string;
  description?: string;
  /** JSON Schema da entrada. */
  inputSchema: Record<string, unknown>;
}

/** Uma conexao com as ferramentas da agenda, aberta para um turno e fechada no fim dele. */
export interface AgendaToolSession {
  /** Sempre na mesma ordem: a lista muda o prefixo do cache do prompt se mudar. */
  readonly tools: AgendaToolSpec[];
  call(name: string, input: unknown, signal: AbortSignal): Promise<ToolOutcome>;
  close(): Promise<void>;
}

/** O que o agente precisa das ferramentas: abrir uma sessao por turno. */
export interface AgendaTools {
  open(signal: AbortSignal): Promise<AgendaToolSession>;
}

export interface McpAgendaToolsConfig {
  /** `POST /mcp` do apps/mcp. */
  url: string;
  /** O Bearer do MCP: a credencial define o dono, nenhuma ferramenta recebe usuario (ADR 004). */
  token: string;
  /** Teto de cada chamada de ferramenta. */
  callTimeoutMs?: number;
}

const DEFAULT_CALL_TIMEOUT_MS = 30_000;
/** O resultado de uma listagem pode ser grande; o que passa disso nao ajuda o modelo e custa tokens. */
const MAX_RESULT_CHARS = 60_000;

/**
 * As ferramentas do MCP da agenda (apps/mcp) para o modo modelo (ADR 0019): as mesmas do Hermes, com a mesma
 * credencial do dono. Criar, ler e editar tarefas, artefatos e recorrencias; nada apaga. O MCP e sem estado,
 * entao cada turno abre a propria conexao e lista as ferramentas uma vez.
 */
export class McpAgendaTools implements AgendaTools {
  constructor(private readonly config: McpAgendaToolsConfig) {}

  async open(signal: AbortSignal): Promise<AgendaToolSession> {
    const client = new Client({ name: "braid-model", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(new URL(this.config.url), {
      requestInit: { headers: { authorization: `Bearer ${this.config.token}` } },
    });
    await client.connect(transport, { signal });
    try {
      const { tools } = await client.listTools(undefined, { signal });
      const definitions = tools
        .map((tool): AgendaToolSpec => ({
          name: tool.name,
          ...(tool.description ? { description: tool.description } : {}),
          inputSchema: tool.inputSchema as Record<string, unknown>,
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
      const timeout = this.config.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
      return {
        tools: definitions,
        call: (name, input, callSignal) => callTool(client, name, input, callSignal, timeout),
        close: () => client.close(),
      };
    } catch (error) {
      await client.close();
      throw error;
    }
  }
}

async function callTool(client: Client, name: string, input: unknown, signal: AbortSignal, timeout: number): Promise<ToolOutcome> {
  const args = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  try {
    const result = await client.callTool({ name, arguments: args }, undefined, { signal, timeout });
    const blocks = Array.isArray(result.content) ? (result.content as Array<{ type?: unknown; text?: unknown }>) : [];
    const text = blocks
      .map((block) => (block.type === "text" && typeof block.text === "string" ? block.text : ""))
      .filter(Boolean)
      .join("\n");
    const content = text || (result.structuredContent ? JSON.stringify(result.structuredContent) : "(sem conteúdo)");
    return { content: clipResult(content), isError: result.isError === true };
  } catch (error) {
    if (signal.aborted) throw error;
    // Falha de transporte ou de protocolo volta ao modelo como erro da ferramenta: ele decide se tenta de novo.
    return { content: `A ferramenta ${name} falhou: ${error instanceof Error ? error.message : "erro desconhecido"}`, isError: true };
  }
}

function clipResult(content: string): string {
  return content.length > MAX_RESULT_CHARS ? `${content.slice(0, MAX_RESULT_CHARS)}\n…(resultado cortado)` : content;
}
