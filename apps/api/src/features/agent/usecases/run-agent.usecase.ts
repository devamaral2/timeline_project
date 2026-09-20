import type {
  EntityBatchWriter,
  EventRepository,
  NoteRepository,
  ScopedSqlQuery,
  ScopedSqlScope,
  TaskRepository,
} from "../../../domain/ports";
import type { AgentConversation } from "../../../domain";
import type { AgentChatTurn, RunAgentRequest, RunAgentResponse } from "@repo/contracts";
import type { AuthenticatedUser } from "../../authenticate-user/authenticated-user";
import type { CreateEventUseCase } from "../../events/usecases/create-event.usecase";
import { AgentLimitReachedError, AgentRunCancelledError } from "../errors/agent.errors";
import type { AgentGateway } from "../gateways/agent.gateway";
import { AgentChangeSession } from "../services/agent-change-session";
import { toChatEntityRefs, toConversationInput } from "../services/agent-chat-history";
import { AgentPromptBuilderService } from "../services/agent-prompt-builder.service";
import type { AgentSkill } from "../skills/agent-skill";
import { AGENT_SKILLS, bindAgentTools } from "../skills/agent-skill-registry";

/** A conversa em que este turno entra. Ausente no caminho REST. */
export interface RunAgentConversation {
  conversationId: string;
  /** Preenchido so quando a conversa nasce neste turno. */
  create?: AgentConversation;
}

/** O que o chat acrescenta a um pedido; o REST nao passa nada disso. */
export interface RunAgentOptions {
  /** Turnos anteriores, carregados pelo servidor a partir da conversa. */
  history?: readonly AgentChatTurn[];
  /** Ha proxima rodada: o agente pode perguntar em vez de desistir. */
  conversational?: boolean;
  /** Abortado antes do commit, nada e gravado. */
  signal?: AbortSignal;
  onProgress?(label: string): void;
  /** Grava o turno junto das entidades, no mesmo lote. */
  conversation?: RunAgentConversation;
  /** Onde o turno caiu na conversa, depois de gravado. */
  onConversationWritten?(seqs: { firstSeq: number; lastSeq: number }): void;
}

export const SAVING_PROGRESS_LABEL = "Salvando";

export class RunAgentUseCase {
  constructor(
    private readonly gateway: AgentGateway,
    private readonly query: ScopedSqlQuery,
    private readonly batchWriter: EntityBatchWriter,
    private readonly repositories: {
      events: Pick<EventRepository, "findById">;
      tasks: Pick<TaskRepository, "findById">;
      notes: Pick<NoteRepository, "findById">;
    },
    private readonly createEvent: Pick<CreateEventUseCase, "prepare">,
    private readonly skills: readonly AgentSkill[] = AGENT_SKILLS,
    private readonly promptBuilder = new AgentPromptBuilderService(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(
    input: RunAgentRequest,
    actor: AuthenticatedUser,
    options: RunAgentOptions = {},
  ): Promise<RunAgentResponse> {

    // O historico de chat so entra no escopo quando o ator e o dono dos dados.
    // Um super admin agindo sobre outro usuario le eventos e tarefas, que sao
    // dados; as mensagens sao texto escrito para um modelo ler, e um usuario
    // pode planta-las esperando justamente essa leitura.
    const scope: ScopedSqlScope = { includeChat: actor.userId === input.userId };

    const session = new AgentChangeSession(input.userId, this.repositories, this.createEvent);
    const labels = new Map(this.skills.map((skill) => [skill.name, skill.progressLabel]));
    const text = options.history?.length ? toConversationInput(options.history, input.text) : input.text;
    const runWith = (requestText: string) =>
      this.gateway.run({
        systemPrompt: this.promptBuilder.build({
          now: this.clock(),
          context: input.context,
          schema: this.query.describeSchema(scope),
          skills: this.skills,
          conversational: options.conversational,
          chatMemory: scope.includeChat,
        }),
        text: requestText,
        tools: bindAgentTools(this.skills, { session, query: this.query, scope }),
        signal: options.signal,
        onToolCall: options.onProgress
          ? (name) => {
              const label = labels.get(name);
              if (label) options.onProgress?.(label);
            }
          : undefined,
      });

    let run = await runWith(text);

    // O modelo as vezes responde "Tarefa alterada." sem ter chamado ferramenta
    // nenhuma — aconteceu com historico de conversa. O texto nao pode afirmar o
    // que nao foi preparado: uma segunda rodada, avisada de que nada foi
    // gravado, decide. Um relatorio que so parece afirmacao custa uma chamada.
    if (!run.stoppedByLimit && !session.hasChanges() && claimsAWrite(run.text) && !options.signal?.aborted) {
      run = await runWith(withWriteCheck(text, run.text));
    }

    // O modelo pode ter terminado no mesmo instante em que o cancelamento
    // chegou: quem cancelou nao espera gravacao nenhuma.
    if (options.signal?.aborted) throw new AgentRunCancelledError();

    // Parar no teto com mudancas preparadas e gravar metade do pedido.
    if (run.stoppedByLimit && session.hasChanges()) throw new AgentLimitReachedError();

    const { created, updated, deleted } = session.result();
    const response: RunAgentResponse = {
      agentResponse: run.text.trim() || fallbackResponse(created.length, updated.length, deleted.length),
      createdEntities: created,
      updatedEntities: updated,
      deletedEntities: deleted,
    };

    if (options.conversation) {
      // `input.text`, e nao `text`: `text` e a conversa inteira ja renderizada,
      // e grava-la faria cada mensagem carregar todas as anteriores.
      session.stageConversationTurn(
        options.conversation,
        input.text,
        response.agentResponse,
        toChatEntityRefs(response),
      );
    }

    if (session.hasChanges() || session.hasMessages()) {
      // "Salvando" so quando ha o que salvar alem da propria conversa: um turno
      // de pura consulta nao deve anunciar gravacao que nao houve.
      if (session.hasChanges()) options.onProgress?.(SAVING_PROGRESS_LABEL);
      const result = await this.batchWriter.commit(session.toBatch());
      if (result.conversation) options.onConversationWritten?.(result.conversation);
    }

    return response;
  }
}

// `\b` do JS nao conhece letra acentuada ("excluí"): a fronteira e escrita a mao.
const LETTER = "[\\wÀ-ÿ]";
const word = (alternatives: string) => new RegExp(`(?<!${LETTER})(${alternatives})(?!${LETTER})`, "i");

const WRITE_CLAIMS = [
  word("criei|registrei|anotei|alterei|atualizei|apaguei|removi|exclu[ií]|adicionei|marquei|mudei|salvei|gravei|agendei|troquei"),
  word("(criad|registrad|anotad|alterad|atualizad|apagad|removid|exclu[ií]d|adicionad|marcad|mudad|salv|gravad|agendad|trocad)[oa]s?"),
];

/** Afirmacao de gravacao em portugues: "criei", "tarefa alterada", "foi registrado". */
export function claimsAWrite(text: string): boolean {
  return WRITE_CLAIMS.some((pattern) => pattern.test(text));
}

function withWriteCheck(request: string, previousAnswer: string): string {
  return [
    request,
    "",
    "[Verificação do servidor: a resposta anterior a este pedido foi:",
    `"${previousAnswer.trim()}"`,
    "mas nenhuma ferramenta de gravação foi chamada, então nada foi criado, alterado ou apagado.",
    "Se o pedido exige gravar, chame as ferramentas agora. Se não exige, responda de novo sem",
    "afirmar que gravou.]",
  ].join("\n");
}

/** O modelo pode encerrar sem texto; a resposta ainda precisa dizer o que aconteceu. */
function fallbackResponse(created: number, updated: number, deleted: number): string {
  if (created + updated + deleted === 0) return "Não encontrei nada para fazer com esse pedido.";
  return `Pronto. Criados: ${created}. Alterados: ${updated}. Apagados: ${deleted}.`;
}
