import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, type OnModuleInit } from "@nestjs/common";
import type {
  RequestDto, StartModelRequestInput, StartEditRequestInput, StartHermesRequestInput, StartRequestInput,
  StartVoiceRequestInput,
} from "@repo/contracts";
import type { FoodGenerationPayload } from "../../domain/ports";
import { isInProgressAgentStatus } from "../../domain/agent-status";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { jobErrorCode, WorkerAttemptsExhaustedError, type JobFailureHandler, type JobsService } from "../../infrastructure/jobs/jobs.service";
import { FOOD_GENERATION_JOB } from "../../infrastructure/persistence/artifacts/repositories/food-generation";
import { assertConfigOwner } from "../agent/config/agent-config-access";
import type { GenerateFoodUseCase } from "../artifacts/generate-food.usecase";
import type { ModelTurnWorker } from "./model-turn-worker";
import type { HermesTurnWorker } from "./hermes-turn-worker";
import { loadAgentDefinition, uiConfig } from "./request-config";
import type { RequestDispatcher } from "./request-dispatcher";
import type { RequestEditTargetWorker } from "./request-edit-target-worker";
import type { RequestEditWorker } from "./request-edit-worker";
import type { RequestEntityWorker } from "./request-entity-worker";
import { requestErrorCode } from "./request-errors";
import type { RequestFinalizer } from "./request-finalizer";
import type { RequestQueryWorker } from "./request-query-worker";
import type { StepPayload } from "./request-step-common";
import {
  ENTITY_AGENT, ENTITY_EDIT_AGENTS, isAgent, parseFallbackCommand, REQUEST_JOBS, STEP_AGENTS, TARGET_EDIT_AGENTS,
} from "./request-steps";
import type { RequestRecord, RequestStore } from "./request-store";
import type { RequestTargetEditWorker } from "./request-target-edit-worker";
import { toRequestDto, type RequestProgress } from "./request-view";
import type { VoiceTaskWorker } from "./voice-task-worker";

export const DEFAULT_REQUEST_LIST_LIMIT = 20;
export const MAX_REQUEST_LIST_LIMIT = 50;

export interface RequestWorkers {
  dispatcher: RequestDispatcher;
  /** O agente unico de escrita do chat. */
  entity: RequestEntityWorker;
  /** A edicao de uma tarefa ou de um artefato de texto aberto na tela de detalhe. */
  edit: RequestEditWorker;
  query: RequestQueryWorker;
  finalizer: RequestFinalizer;
  editTarget: RequestEditTargetWorker;
  targetEdit: RequestTargetEditWorker;
  hermes: HermesTurnWorker;
  model: ModelTurnWorker;
  voice: VoiceTaskWorker;
  food: GenerateFoodUseCase;
}

/** Registra os handlers da fila dos pedidos e expoe o que o transporte precisa: iniciar, acompanhar e cancelar. */
@Injectable()
export class RequestOperations implements OnModuleInit {
  constructor(
    private readonly jobs: Pick<JobsService, "register" | "cancelOfTasks" | "progressOfTask">,
    private readonly store: RequestStore,
    private readonly workers: RequestWorkers,
  ) {}

  onModuleInit(): void {
    const { workers } = this;
    // Um `.md` que falta ou quebrou derruba a subida, em vez de virar "erro interno" na primeira edicao.
    for (const agent of [...STEP_AGENTS, "failure-explainer"]) loadAgentDefinition(agent);

    this.jobs.register(REQUEST_JOBS.dispatch, async (raw, context) => {
      await workers.dispatcher.run((raw as { requestId: string }).requestId, context.signal);
    }, { onFailure: this.failRequest(uiConfig.dispatchFailed) });
    this.jobs.register(REQUEST_JOBS.editTarget, async (raw) => {
      await workers.editTarget.run((raw as { requestId: string }).requestId);
    }, { onFailure: this.failRequest(uiConfig.dispatchFailed) });
    this.jobs.register(REQUEST_JOBS.step, async (raw, context) => {
      await this.runStep(raw as StepPayload, context.signal);
    }, { onFailure: this.failStep });
    this.jobs.register(REQUEST_JOBS.finalize, async (raw, context) => {
      await workers.finalizer.run(raw as StepPayload, context.signal);
    }, { onFailure: this.failRequest() });
    this.jobs.register(REQUEST_JOBS.hermes, async (raw, context) => {
      await workers.hermes.run((raw as { requestId: string }).requestId, {
        signal: context.signal, progress: (value) => context.progress(value),
      });
    }, { onFailure: this.failRequest() });
    this.jobs.register(REQUEST_JOBS.model, async (raw, context) => {
      await workers.model.run((raw as { requestId: string }).requestId, {
        signal: context.signal, progress: (value) => context.progress(value),
      });
    }, { onFailure: this.failRequest() });
    this.jobs.register(REQUEST_JOBS.voice, async (raw) => {
      await workers.voice.run((raw as { requestId: string }).requestId);
    }, { onFailure: this.failRequest() });
    this.jobs.register(FOOD_GENERATION_JOB, async (raw, context) => {
      if (context.taskId) {
        await this.store.markStarting(context.taskId);
        await this.store.markRunning(context.taskId);
      }
      await workers.food.execute(raw as FoodGenerationPayload);
    }, {
      onFailure: async (raw) => {
        await workers.food.fail(raw as FoodGenerationPayload);
      },
    });
  }

  /** O passo roda no worker do agente dele. */
  private async runStep(payload: StepPayload, signal: AbortSignal): Promise<void> {
    const step = (await this.store.steps(payload.requestId)).find((candidate) => candidate.id === payload.stepId);
    if (!step) return;
    const { agent } = step;
    if (agent === ENTITY_AGENT) return this.workers.entity.run(payload, signal);
    if (isAgent(ENTITY_EDIT_AGENTS, agent)) return this.workers.edit.run(agent, payload, signal);
    if (isAgent(TARGET_EDIT_AGENTS, agent)) return this.workers.targetEdit.run(agent, payload, signal);
    if (agent === "query") return this.workers.query.run(payload, signal);
    throw new Error(`Step agent without a worker: ${agent}`);
  }

  /** O job do passo morreu (worker caiu, tentativas esgotadas): o passo fica vermelho e a finalizacao fecha o pedido. */
  private readonly failStep: JobFailureHandler = async (raw, _context, error) => {
    const { requestId, stepId } = raw as StepPayload;
    await this.store.failStep({ requestId, stepId, errorCode: jobErrorCode(error) });
  };

  /** O job que conduz o pedido morreu: o pedido nunca fica aberto sem ninguem trabalhando nele. */
  private failRequest(message?: string): JobFailureHandler {
    return async (raw, _context, error) => {
      const { requestId } = raw as { requestId: string };
      const outcome = { errorCode: requestErrorCode(jobErrorCode(error)), ...(message ? { message } : {}) };
      // O worker morreu com o job e as tentativas acabaram: o pedido foi interrompido. So quem estava `running` se
      // interrompe; um pedido que ainda nao tinha comecado cai no `failed`, para nunca ficar aberto sem ninguem.
      if (error instanceof WorkerAttemptsExhaustedError) await this.store.finish(requestId, "interrupted", outcome);
      await this.store.finish(requestId, "failed", outcome);
    };
  }

  /**
   * `POST /api/requests`: o JEV de entrada decide o destino do pedido (consulta, escrita, modo modelo ou Hermes).
   * Quem confere se o provedor e o modelo escolhidos valem neste ambiente e a rota, antes daqui.
   */
  async start(input: StartRequestInput, actor: AuthenticatedUser): Promise<string> {
    this.assertSelf(input.userId, actor);
    await this.assertSession(input.sessionId, actor);
    // `fallback: <pedido>`: o pedido guarda so o pedido e o despacho pula o JEV, direto ao Hermes.
    const forced = parseFallbackCommand(input.text);
    const { requestId } = await this.store.start({
      userId: input.userId, route: "steps", text: forced ?? input.text, context: input.context,
      sessionId: input.sessionId, clientMessageId: input.clientMessageId, job: REQUEST_JOBS.dispatch,
      ...(forced ? { forceFallback: true } : {}),
      // A escolha do usuario fica no pedido: os agentes dos passos rodam com ela.
      ...(input.model ? { model: input.model } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
    });
    return requestId;
  }

  /**
   * `POST /api/requests/edit`, a edicao pela tela de detalhe (ADR 006): o pedido nasce ja com o alvo; o worker
   * escolhe o agente. Skills e agentes do Hermes mudam o comportamento de todos os pedidos, entao so o dono
   * (ADR 0004) edita.
   */
  async startEdit(input: StartEditRequestInput, actor: AuthenticatedUser): Promise<string> {
    this.assertSelf(input.userId, actor);
    if (input.entityType === "skill_artifact" || input.entityType === "agent_artifact") assertConfigOwner(actor);
    const { requestId } = await this.store.start({
      userId: input.userId, route: "steps", text: input.text,
      context: { screen: "detail", entityId: input.entityId },
      target: { entityType: input.entityType, entityId: input.entityId },
      job: REQUEST_JOBS.editTarget,
      ...(input.model ? { model: input.model } : {}),
    });
    return requestId;
  }

  /** `POST /api/requests/hermes`: a mensagem vai para o Hermes (ADR 004). O Hermes e do dono: so ele fala com o proprio. */
  async startHermes(input: StartHermesRequestInput, actor: AuthenticatedUser): Promise<RequestDto> {
    if (input.userId !== actor.userId) throw new ForbiddenException();
    await this.assertSession(input.sessionId, actor);
    const { requestId } = await this.store.start({
      userId: input.userId, route: "hermes", text: input.text, sessionId: input.sessionId,
      clientMessageId: input.clientMessageId, job: REQUEST_JOBS.hermes,
      ...(input.projectId ? { projectId: input.projectId } : {}),
    });
    return this.view(requestId, actor);
  }

  /**
   * `POST /api/requests/model`: a mensagem vai para o modelo escolhido (ADR 0019). Com as ferramentas da agenda
   * ligadas, o modelo age como o dono do MCP, entao so esse dono (`owner`) fala com ele; sem elas, cada um fala com o
   * proprio. Quem confere se o provedor e o modelo valem neste ambiente e a rota, antes daqui.
   */
  async startModel(input: StartModelRequestInput, actor: AuthenticatedUser, owner?: string): Promise<RequestDto> {
    if (input.userId !== actor.userId || (owner !== undefined && actor.userId !== owner)) throw new ForbiddenException();
    await this.assertSession(input.sessionId, actor);
    const { requestId } = await this.store.start({
      userId: input.userId, route: "model", text: input.text, sessionId: input.sessionId,
      clientMessageId: input.clientMessageId, model: input.model, job: REQUEST_JOBS.model,
      ...(input.projectId ? { projectId: input.projectId } : {}),
    });
    return this.view(requestId, actor);
  }

  /** `POST /api/requests/voice`: a fala vira um pedido, e o pedido gera a tarefa. */
  async startVoice(input: StartVoiceRequestInput, actor: AuthenticatedUser): Promise<string> {
    const { requestId } = await this.store.start({
      userId: actor.userId, route: "voice", text: input.transcript,
      clientMessageId: input.clientMessageId, job: REQUEST_JOBS.voice,
    });
    return requestId;
  }

  async view(id: string, actor: AuthenticatedUser): Promise<RequestDto> {
    return this.toDto(await this.owned(id, actor), true);
  }

  /** Os pedidos do usuario, do mais novo para o mais antigo, sem o rastro de cada um. */
  async list(actor: AuthenticatedUser, limit = DEFAULT_REQUEST_LIST_LIMIT): Promise<RequestDto[]> {
    const requests = await this.store.list(actor.userId, Math.min(Math.max(1, limit), MAX_REQUEST_LIST_LIMIT));
    return Promise.all(requests.map((request) => this.toDto(request, false)));
  }

  /**
   * `POST /api/requests/:id/cancel`: cancela os jobs vivos do pedido e dos passos e marca como cancelado o que nao
   * terminou. O pedido que calcula um alimento nao se cancela por aqui: apagar o alimento e o caminho.
   */
  async cancel(id: string, actor: AuthenticatedUser): Promise<RequestDto> {
    const request = await this.owned(id, actor);
    if (request.route === "food") throw new ConflictException("Delete the food artifact to stop its generation");
    const taskIds = await this.store.cancel(request.id);
    await this.jobs.cancelOfTasks(taskIds, request.userId);
    return this.view(id, actor);
  }

  private async toDto(request: RequestRecord, detailed: boolean): Promise<RequestDto> {
    const live = detailed && (request.route === "hermes" || request.route === "model")
      && isInProgressAgentStatus(request.status);
    const [steps, entities, progress] = await Promise.all([
      this.store.steps(request.id),
      this.store.entities(request.id),
      live ? this.jobs.progressOfTask(request.id) : undefined,
    ]);
    return toRequestDto(request, steps, entities, {
      progress: (progress ?? undefined) as RequestProgress | undefined, withTrace: detailed,
    });
  }

  /** Pedido de outro usuario recebe o mesmo 404 de um id que nao existe. */
  private async owned(id: string, actor: AuthenticatedUser): Promise<RequestRecord> {
    const request = await this.store.find(id);
    if (!request || request.userId !== actor.userId) throw new NotFoundException("Request not found");
    return request;
  }

  private assertSelf(userId: string, actor: AuthenticatedUser): void {
    if (userId !== actor.userId) throw new ForbiddenException("Sem permissão para acessar os dados deste usuário");
  }

  /** A sessao e o primeiro pedido dela: precisa ser do usuario e nao ser, ela mesma, uma continuacao. */
  private async assertSession(sessionId: string | undefined, actor: AuthenticatedUser): Promise<void> {
    if (!sessionId) return;
    const first = await this.store.find(sessionId);
    if (!first || first.userId !== actor.userId) throw new NotFoundException("Session not found");
    if (first.sessionId) throw new BadRequestException("sessionId must be the first request of the session");
  }
}
