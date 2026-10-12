import type {
  EntityBatchWriter,
  EventRepository,
  NoteRepository,
  RecurrenceRepository,
  ScopedSqlQuery,
  ScopedSqlScope,
  TaskRepository,
} from "../../domain/ports";
import type { AgentConversation, Event } from "../../domain";
import type { AgentChatTurn, RunAgentRequest, RunAgentResponse } from "@repo/contracts";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { dayKeyOf, formatTime } from "@repo/timeline";
import { z } from "zod";
import type { CreateEventUseCase } from "../events/create-event.usecase";
import type { RecurrenceMaterializer } from "../recurrences/materialize-recurrences.usecase";
import { AgentLimitReachedError, AgentRunCancelledError, InvalidInputError, LlmUnavailableError } from "./errors/agent.errors";
import { agentsConfig, fill, promptsConfig } from "./config/agent-config";
import type { AgentGateway } from "./gateways/agent.gateway";
import type { AgentRouter } from "./routing/agent-router";
import type { DayContextEvent, DayContextQuery } from "./day-context.query";
import { AgentChangeSession, type StagedSeries } from "./services/agent-change-session";
import { describeRecurrenceRule } from "../recurrences/describe-recurrence-rule";
import { planDayRearrangement, type EventShift } from "./services/plan-day-rearrangement";
import { TurnTimings } from "./services/turn-timings";
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

export const SAVING_PROGRESS_LABEL = promptsConfig.responses.savingProgressLabel;

const commandEnvelope = z.object({
  commands: z.array(z.object({ skill: z.string(), args: z.record(z.string(), z.unknown()) }).strict()).max(agentsConfig.limits.maxCommands),
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
      recurrences?: Pick<RecurrenceRepository, "findById" | "findNextOccurrenceId">;
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

    const session = new AgentChangeSession(input.userId, this.repositories, this.createEvent, this.clock);
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
    timings = new TurnTimings(),
  ): Promise<RunAgentResponse> {
    const now = this.clock();
    const scope: ScopedSqlScope = { includeChat: actor.userId === input.userId };
    const router = this.router;
    if (!router) throw new Error("Agent router is not configured");
    const route = forcedRoute ?? await timings.time("route", () => router.route({
      text: input.text,
      context: input.context,
      history: scope.includeChat ? options.history : undefined,
      now,
      signal: options.signal,
    }));
    if (options.signal?.aborted) throw new AgentRunCancelledError();

    const session = new AgentChangeSession(input.userId, this.repositories, this.createEvent, this.clock);
    const loadedDays = new Map<string, Awaited<ReturnType<DayContextQuery["get"]>>>();
    const dayPages = new Map<string, { pages: Awaited<ReturnType<DayContextQuery["get"]>>[]; next: number }>();
    const context = { session, query: this.query, scope, dayContext: this.dayContext, recurrences: this.recurrences, loadedDays, dayPages };
    const spec = agentsConfig.routes[route.kind];
    const catalog = [...this.skills, getDayContextSkill];
    const readSkills = spec.readSkills.flatMap((name) => catalog.filter((skill) => skill.name === name));
    const writeSkills = spec.writeSkills === "routed"
      ? this.skills.filter((skill) => route.kind === "single" && skill.name === route.skill)
      : spec.writeSkills === "all"
        ? this.skills.filter((skill) => !spec.readSkills.includes(skill.name))
        : spec.writeSkills.flatMap((name) => catalog.filter((skill) => skill.name === name));
    if (route.kind === "single" && writeSkills.length !== 1) throw new Error(`Unknown routed skill: ${route.skill}`);
    let reads = 0;
    const tools = bindAgentTools(readSkills, context).map((tool) => ({
      ...tool,
      execute: async (args: unknown) => {
        const result = await timings.time("reads", () => tool.execute(args));
        if ((result as { ok?: boolean })?.ok) reads += 1;
        return result;
      },
    }));
    const labels = new Map(readSkills.map((skill) => [skill.name, skill.progressLabel]));
    const text = options.history?.length ? toConversationInput(options.history, input.text) : input.text;
    // `agent` inclui as leituras (`reads`): o tempo so do modelo e agent - reads.
    const run = await timings.time("agent", () => this.gateway.run({
      systemPrompt: this.promptBuilder.build({
        now, context: input.context, schema: this.query.describeSchema(scope),
        skills: [...readSkills, ...writeSkills], conversational: options.conversational,
        chatMemory: scope.includeChat, routed: spec.prompt,
      }),
      text,
      tools,
      signal: options.signal,
      onToolCall: (name) => {
        const label = labels.get(name);
        if (label) options.onProgress?.(label);
      },
    }));
    if (options.signal?.aborted) throw new AgentRunCancelledError();
    if (run.stoppedByLimit && route.kind !== "read") throw new AgentLimitReachedError();

    let reply = run.text.trim();
    if (route.kind === "read" && claimsAWrite(reply)) {
      return this.executeRouted(input, actor, options, { kind: "complex" }, timings);
    }
    let report: string | undefined;
    const shifted = new Map<string, EventShift>();
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
        // Inclui o parse de refeicao pelo modelo, que roda dentro de `prepare`.
        const outcome = await timings.time("commands", () => skill.run(parsed.data, context)) as { ok?: boolean; error?: string; id?: string; kind?: string };
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
          const plan = planDayRearrangement(target, dayEvents, session.eventBeforeChange(target.id));
          if (plan.kind === "clarification") {
            reply = plan.message;
            return this.finishRouted(input, options, new AgentChangeSession(input.userId, this.repositories, this.createEvent), {
              agentResponse: reply, createdEntities: [], updatedEntities: [], deletedEntities: [],
            }, timings, route.kind);
          }
          for (const shift of plan.shifts) {
            const shiftedStartDay = dayKeyOf(shift.startedAt, "America/Sao_Paulo");
            const shiftedEndDay = dayKeyOf(shift.finishedAt, "America/Sao_Paulo");
            if (!loadedDays.has(shiftedStartDay) || !loadedDays.has(shiftedEndDay)) {
              throw new InvalidInputError(`Consulte ${shiftedStartDay}${shiftedEndDay === shiftedStartDay ? "" : ` e ${shiftedEndDay}`} antes de deslocar eventos.`);
            }
            const outcomeOfShift = await session.updateEvent(shift.id, shift.kind, async (current) =>
              current.revise({ startedAt: shift.startedAt, finishedAt: shift.finishedAt }));
            if (!outcomeOfShift.ok) throw new InvalidInputError(outcomeOfShift.error);
            shifted.set(shift.id, shift);
          }
        }
      }
    }

    const { created, updated, deleted } = await session.result();
    const summary = describeChanges(created, updated, deleted, session.series(), shifted);
    const response: RunAgentResponse = {
      agentResponse: [report, summary || reply].filter(Boolean).join("\n") || promptsConfig.responses.nothingToDo,
      createdEntities: created, updatedEntities: updated, deletedEntities: deleted,
    };
    return this.finishRouted(input, options, session, response, timings, route.kind);
  }

  private async finishRouted(
    input: RunAgentRequest,
    options: RunAgentOptions,
    session: AgentChangeSession,
    response: RunAgentResponse,
    timings: TurnTimings,
    route: string,
  ): Promise<RunAgentResponse> {
    if (options.signal?.aborted) throw new AgentRunCancelledError();
    if (options.conversation) {
      session.stageConversationTurn(options.conversation, input.text, response.agentResponse, toChatEntityRefs(response));
    }
    if (session.hasChanges() || session.hasMessages()) {
      if (session.hasChanges()) options.onProgress?.(SAVING_PROGRESS_LABEL);
      const result = await timings.time("commit", () => this.batchWriter.commit(session.toBatch()));
      if (result.conversation) options.onConversationWritten?.(result.conversation);
    }
    console.info("[AgentTurn] timings", {
      route,
      changes: response.createdEntities.length + response.updatedEntities.length + response.deletedEntities.length,
      ...timings.summary(),
    });
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
  series: readonly StagedSeries[] = [],
  shifted: ReadonlyMap<string, EventShift> = new Map(),
): string {
  const line = (items: RunAgentResponse["createdEntities"], action: string) =>
    items.length ? `${action}: ${items.map((item) => item.name).join(", ")}.` : "";
  const { responses } = promptsConfig;
  // A ocorrencia que a resposta mostra no lugar da serie (para abrir e para a
  // agenda atualizar) nao entra nas linhas de entidades: o texto fala da serie.
  const shown = new Set(series.flatMap((staged) => (staged.shownOccurrenceId ? [staged.shownOccurrenceId] : [])));
  const seriesLines = series.map(({ op, recurrence }) => {
    const name = String(recurrence.template.name ?? "");
    const title = (label: string) => `${label}${name ? ` ${name}` : ""}`;
    if (op === "delete") return `${title(responses.deletedSeries)}. ${responses.deletedSeriesNote}`;
    const label = op === "create" ? responses.createdSeries : responses.updatedSeries;
    return `${title(label)}: ${describeRecurrenceRule(recurrence.rule)}.`;
  });
  return [
    line(created.filter((item) => !shown.has(item.id)), responses.created),
    ...seriesLines,
    line(updated.filter((item) => !shifted.has(item.id)), responses.updated),
    shiftedLine(updated.filter((item) => shifted.has(item.id)), shifted),
    line(deleted.filter((item) => !shown.has(item.id)), responses.deleted),
  ].filter(Boolean).join("\n");
}

/** O que o servidor empurrou para acomodar a mudanca pedida, com o novo horario. */
function shiftedLine(items: RunAgentResponse["updatedEntities"], shifted: ReadonlyMap<string, EventShift>): string {
  const moved = items.flatMap((item) => {
    const shift = shifted.get(item.id);
    if (!shift) return [];
    const zone = promptsConfig.timeZone;
    return [`${item.name} (${formatTime(shift.startedAt.toISOString(), zone)}–${formatTime(shift.finishedAt.toISOString(), zone)})`];
  });
  return moved.length ? `${promptsConfig.responses.rearranged}: ${moved.join(", ")}.` : "";
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
  return [request, ...promptsConfig.writeCheck.map((line) => fill(line, { previousAnswer: previousAnswer.trim() }))].join("\n");
}

/** O modelo pode encerrar sem texto; a resposta ainda precisa dizer o que aconteceu. */
function fallbackResponse(created: number, updated: number, deleted: number): string {
  const { responses } = promptsConfig;
  if (created + updated + deleted === 0) return responses.nothingToDo;
  return fill(responses.summaryFallback, { created: String(created), updated: String(updated), deleted: String(deleted) });
}
