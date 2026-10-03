import type {
  EntityBatchWriter,
  EventRepository,
  NoteRepository,
  ScopedSqlQuery,
  ScopedSqlScope,
  TaskRepository,
} from "../../domain/ports";
import type { AgentConversation, Event } from "../../domain";
import type { AgentChatTurn, RunAgentRequest, RunAgentResponse } from "@repo/contracts";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { dayKeyOf } from "@repo/timeline";
import { z } from "zod";
import type { CreateEventUseCase } from "../events/create-event.usecase";
import type { RecurrenceMaterializer } from "../recurrences/materialize-recurrences.usecase";
import { AgentLimitReachedError, AgentRunCancelledError, InvalidInputError, LlmUnavailableError } from "./errors/agent.errors";
import type { AgentGateway } from "./gateways/agent.gateway";
import type { AgentRouter } from "./routing/agent-router";
import type { DayContextEvent, DayContextQuery } from "./day-context.query";
import { AgentChangeSession } from "./services/agent-change-session";
import { planDayRearrangement } from "./services/plan-day-rearrangement";
import { toChatEntityRefs, toConversationInput } from "./services/agent-chat-history";
import { AgentPromptBuilderService } from "./services/agent-prompt-builder.service";
import type { AgentSkill } from "./skills/agent-skill";
import { AGENT_SKILLS, bindAgentTools } from "./skills/agent-skill-registry";
import { getDayContextSkill } from "./skills/get-day-context.skill";

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

const commandEnvelope = z.object({
  commands: z.array(z.object({ skill: z.string(), args: z.record(z.string(), z.unknown()) }).strict()).max(30),
  clarification: z.string().optional(),
  report: z.string().optional(),
}).strict();

export class RunAgentUseCase {
  constructor(
    private readonly gateway: AgentGateway,
    private readonly query: ScopedSqlQuery,
    private readonly batchWriter: EntityBatchWriter,
    private readonly repositories: {
      events: Pick<EventRepository, "findById">;
      tasks: Pick<TaskRepository, "findById">;
      notes: Pick<NoteRepository, "findById" | "findByIds">;
    },
    private readonly createEvent: Pick<CreateEventUseCase, "prepare" | "buildNote">,
    private readonly skills: readonly AgentSkill[] = AGENT_SKILLS,
    private readonly promptBuilder = new AgentPromptBuilderService(),
    private readonly clock: () => Date = () => new Date(),
    private readonly router?: AgentRouter,
    private readonly dayContext?: DayContextQuery,
    private readonly recurrences?: RecurrenceMaterializer,
  ) {}

  async execute(
    input: RunAgentRequest,
    actor: AuthenticatedUser,
    options: RunAgentOptions = {},
  ): Promise<RunAgentResponse> {
    if (this.router) return this.executeRouted(input, actor, options);

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

    const { created, updated, deleted } = await session.result();
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

  private async executeRouted(
    input: RunAgentRequest,
    actor: AuthenticatedUser,
    options: RunAgentOptions,
    forcedRoute?: Awaited<ReturnType<AgentRouter["route"]>>,
  ): Promise<RunAgentResponse> {
    const now = this.clock();
    const scope: ScopedSqlScope = { includeChat: actor.userId === input.userId };
    if (!this.router) throw new Error("Agent router is not configured");
    const route = forcedRoute ?? await this.router.route({
      text: input.text,
      context: input.context,
      history: scope.includeChat ? options.history : undefined,
      now,
      signal: options.signal,
    });
    if (options.signal?.aborted) throw new AgentRunCancelledError();

    const session = new AgentChangeSession(input.userId, this.repositories, this.createEvent);
    const loadedDays = new Map<string, Awaited<ReturnType<DayContextQuery["get"]>>>();
    const dayPages = new Map<string, { pages: Awaited<ReturnType<DayContextQuery["get"]>>[]; next: number }>();
    const context = { session, query: this.query, scope, dayContext: this.dayContext, recurrences: this.recurrences, loadedDays, dayPages };
    const readSkills = [...this.skills.filter((skill) => skill.name === "query_data"), getDayContextSkill];
    const writeSkills = route.kind === "read"
      ? []
      : route.kind === "single"
        ? this.skills.filter((skill) => skill.name === route.skill)
        : this.skills.filter((skill) => skill.name !== "query_data");
    if (route.kind === "single" && writeSkills.length !== 1) throw new Error(`Unknown routed skill: ${route.skill}`);
    let reads = 0;
    const tools = bindAgentTools(readSkills, context).map((tool) => ({
      ...tool,
      execute: async (args: unknown) => {
        const result = await tool.execute(args);
        if ((result as { ok?: boolean })?.ok) reads += 1;
        return result;
      },
    }));
    const labels = new Map(readSkills.map((skill) => [skill.name, skill.progressLabel]));
    const text = options.history?.length ? toConversationInput(options.history, input.text) : input.text;
    const run = await this.gateway.run({
      systemPrompt: this.promptBuilder.build({
        now, context: input.context, schema: this.query.describeSchema(scope),
        skills: [...readSkills, ...writeSkills], conversational: options.conversational,
        chatMemory: scope.includeChat, routed: route.kind === "read" ? "read" : "write",
      }),
      text,
      tools,
      signal: options.signal,
      onToolCall: (name) => {
        const label = labels.get(name);
        if (label) options.onProgress?.(label);
      },
    });
    if (options.signal?.aborted) throw new AgentRunCancelledError();
    if (run.stoppedByLimit && route.kind !== "read") throw new AgentLimitReachedError();

    let reply = run.text.trim();
    if (route.kind === "read" && claimsAWrite(reply)) {
      return this.executeRouted(input, actor, options, { kind: "complex" });
    }
    let report: string | undefined;
    if (route.kind !== "read") {
      let envelope: z.infer<typeof commandEnvelope>;
      try { envelope = commandEnvelope.parse(JSON.parse(run.text)); }
      catch (error) { throw new LlmUnavailableError("Resposta JSON inválida do agente", error); }
      if (envelope.clarification && envelope.commands.length) {
        throw new InvalidInputError("O agente pediu esclarecimento e também tentou gravar.");
      }
      report = envelope.report && !claimsAWrite(envelope.report) ? envelope.report : undefined;
      reply = envelope.clarification ?? "";
      if (envelope.commands.length && reads === 0) throw new InvalidInputError("Consulte os dados antes de gravar.");
      for (const command of envelope.commands) {
        const skill = writeSkills.find((candidate) => candidate.name === command.skill);
        if (!skill) throw new InvalidInputError(`Skill não permitida nesta rota: ${command.skill}`);
        const parsed = skill.parameters.strict().safeParse(command.args);
        if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
        options.onProgress?.(skill.progressLabel);
        const outcome = await skill.run(parsed.data, context) as { ok?: boolean; error?: string; id?: string; kind?: string };
        if (!outcome?.ok) throw new InvalidInputError(outcome?.error ?? "Comando inválido.");
        if (outcome.kind === "event" && command.skill !== "delete_entity") {
          const target = outcome.id ? session.stagedEvent(outcome.id) : undefined;
          if (!target) throw new InvalidInputError("Evento preparado não encontrado.");
          const firstDay = dayKeyOf(target.startedAt, "America/Sao_Paulo");
          const lastDay = dayKeyOf(target.finishedAt ?? target.startedAt, "America/Sao_Paulo");
          if (!loadedDays.has(firstDay) || !loadedDays.has(lastDay)) {
            throw new InvalidInputError(`Consulte todos os eventos de ${firstDay}${lastDay === firstDay ? "" : ` e ${lastDay}`} antes de gravar.`);
          }
          const dayEvents = dayEventsWithStagedChanges(loadedDays, session);
          const plan = planDayRearrangement(target, dayEvents);
          if (plan.kind === "clarification") {
            reply = plan.message;
            return this.finishRouted(input, options, new AgentChangeSession(input.userId, this.repositories, this.createEvent), {
              agentResponse: reply, createdEntities: [], updatedEntities: [], deletedEntities: [],
            });
          }
          for (const shift of plan.shifts) {
            const shiftedStartDay = dayKeyOf(shift.startedAt, "America/Sao_Paulo");
            const shiftedEndDay = dayKeyOf(shift.finishedAt, "America/Sao_Paulo");
            if (!loadedDays.has(shiftedStartDay) || !loadedDays.has(shiftedEndDay)) {
              throw new InvalidInputError(`Consulte ${shiftedStartDay}${shiftedEndDay === shiftedStartDay ? "" : ` e ${shiftedEndDay}`} antes de deslocar eventos.`);
            }
            const shifted = await session.updateEvent(shift.id, shift.kind, async (current) =>
              current.revise({ startedAt: shift.startedAt, finishedAt: shift.finishedAt }));
            if (!shifted.ok) throw new InvalidInputError(shifted.error);
          }
        }
      }
    }

    const { created, updated, deleted } = await session.result();
    const summary = describeChanges(created, updated, deleted);
    const response: RunAgentResponse = {
      agentResponse: [report, summary || reply].filter(Boolean).join("\n") || "Não encontrei nada para fazer com esse pedido.",
      createdEntities: created, updatedEntities: updated, deletedEntities: deleted,
    };
    return this.finishRouted(input, options, session, response);
  }

  private async finishRouted(
    input: RunAgentRequest,
    options: RunAgentOptions,
    session: AgentChangeSession,
    response: RunAgentResponse,
  ): Promise<RunAgentResponse> {
    if (options.signal?.aborted) throw new AgentRunCancelledError();
    if (options.conversation) {
      session.stageConversationTurn(options.conversation, input.text, response.agentResponse, toChatEntityRefs(response));
    }
    if (session.hasChanges() || session.hasMessages()) {
      if (session.hasChanges()) options.onProgress?.(SAVING_PROGRESS_LABEL);
      const result = await this.batchWriter.commit(session.toBatch());
      if (result.conversation) options.onConversationWritten?.(result.conversation);
    }
    return response;
  }
}

function dayEventsWithStagedChanges(
  loadedDays: Map<string, Awaited<ReturnType<DayContextQuery["get"]>>>,
  session: AgentChangeSession,
): DayContextEvent[] {
  const events = new Map([...loadedDays.values()].flatMap((day) => day.events).map((event) => [event.id, event]));
  for (const change of session.toBatch().events) {
    if (change.op === "delete") events.delete(change.id);
    else events.set(change.entity.id, stagedDayEvent(change.entity));
  }
  return [...events.values()];
}

function stagedDayEvent(event: Event): DayContextEvent {
  return {
    id: event.id, name: event.name, started_at: event.startedAt.toISOString(),
    finished_at: event.finishedAt?.toISOString() ?? null,
    recurrence_id: event.occurrence?.recurrenceId ?? null,
    taskIds: [...event.taskIds],
    kind: event.kind,
  };
}

function describeChanges(
  created: RunAgentResponse["createdEntities"],
  updated: RunAgentResponse["updatedEntities"],
  deleted: RunAgentResponse["deletedEntities"],
): string {
  const line = (items: RunAgentResponse["createdEntities"], action: string) =>
    items.length ? `${action}: ${items.map((item) => item.name).join(", ")}.` : "";
  return [line(created, "Criei"), line(updated, "Atualizei"), line(deleted, "Apaguei")].filter(Boolean).join("\n");
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
