import { ForbiddenException, Injectable, NotFoundException, type OnModuleInit } from "@nestjs/common";
import type { AgentScreenContext, AiProcessEditEntityType } from "@repo/contracts";
import { ulid } from "ulid";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { AiJobsService } from "../../infrastructure/ai-jobs/ai-jobs.service";
import { ProcessDispatcher } from "./process-dispatcher";
import { ProcessFallback } from "./process-fallback";
import { ProcessFinalizer } from "./process-finalizer";
import { loadAgentDefinition } from "./process-config";
import { CREATE_AGENTS, EDIT_AGENTS, STEP_AGENTS, TARGET_EDIT_AGENTS, jobKindOf } from "./process-steps";
import { assertConfigOwner } from "../agent/config/agent-config-access";
import { ProcessEditTargetWorker, type EditTargetPayload } from "./process-edit-target-worker";
import { ProcessTargetEditWorker } from "./process-target-edit-worker";
import { ProcessEditWorker } from "./process-edit-worker";
import { ProcessQueryWorker } from "./process-query-worker";
import type { StepPayload } from "./process-step-common";
import { ProcessStepWorker } from "./process-step-worker";
import type { ProcessStore } from "./process-store";
import { toProcessView, type ProcessView } from "./process-view";

/** Registra os handlers das filas do processo e expoe o que o transporte precisa: iniciar e acompanhar. */
@Injectable()
export class ProcessOperations implements OnModuleInit {
  constructor(
    private readonly jobs: AiJobsService,
    private readonly store: ProcessStore,
    private readonly dispatcher: ProcessDispatcher,
    private readonly worker: ProcessStepWorker,
    private readonly editWorker: ProcessEditWorker,
    private readonly queryWorker: ProcessQueryWorker,
    private readonly finalizer: ProcessFinalizer,
    private readonly fallback: ProcessFallback,
    private readonly targetWorker: ProcessEditTargetWorker,
    private readonly targetEditWorker: ProcessTargetEditWorker,
  ) {}

  onModuleInit(): void {
    // Um `.md` que falta ou quebrou derruba a subida, em vez de virar "erro interno" na primeira edicao.
    for (const agent of STEP_AGENTS) loadAgentDefinition(agent);
    this.jobs.register("process-dispatch", async (raw, context) => {
      await this.dispatcher.run((raw as { processId: string }).processId, context.signal);
      return null;
    });
    for (const agent of CREATE_AGENTS) {
      this.jobs.register(jobKindOf(agent), async (raw, context) => {
        await this.worker.run(agent, raw as StepPayload, context.signal);
        return null;
      });
    }
    for (const agent of EDIT_AGENTS) {
      this.jobs.register(jobKindOf(agent), async (raw, context) => {
        await this.editWorker.run(agent, raw as StepPayload, context.signal);
        return null;
      });
    }
    this.jobs.register("process-edit-target", async (raw) => {
      await this.targetWorker.run(raw as EditTargetPayload);
      return null;
    });
    for (const agent of TARGET_EDIT_AGENTS) {
      this.jobs.register(jobKindOf(agent), async (raw, context) => {
        await this.targetEditWorker.run(agent, raw as StepPayload, context.signal);
        return null;
      });
    }
    this.jobs.register(jobKindOf("query"), async (raw, context) => {
      await this.queryWorker.run(raw as StepPayload, context.signal);
      return null;
    });
    this.jobs.register("process-fallback", async (raw, context) => {
      await this.fallback.run(raw as StepPayload, context.signal);
      return null;
    });
    this.jobs.register("process-finalize", async (raw, context) => {
      await this.finalizer.run(raw as StepPayload, context.signal);
      return null;
    });
  }

  async start(input: { userId: string; text: string; context?: AgentScreenContext }, actor: AuthenticatedUser): Promise<string> {
    if (input.userId !== actor.userId) throw new ForbiddenException("Sem permissão para acessar os dados deste usuário");
    const id = ulid();
    await this.store.start({
      id, userId: input.userId, actorId: actor.userId, prompt: input.text, context: input.context,
    });
    return id;
  }

  /**
   * A edicao pela tela de detalhe (ADR 006): o processo nasce ja com o alvo; o worker escolhe o agente. Skills e
   * agentes do Hermes mudam o comportamento de todos os pedidos, entao so o dono (ADR 0004) edita.
   */
  async startEdit(
    input: { userId: string; text: string; entityType: AiProcessEditEntityType; entityId: string },
    actor: AuthenticatedUser,
  ): Promise<string> {
    if (input.userId !== actor.userId) throw new ForbiddenException("Sem permissão para acessar os dados deste usuário");
    if (input.entityType === "skill_note" || input.entityType === "agent_note") assertConfigOwner(actor);
    const id = ulid();
    await this.store.startEdit({
      id, userId: input.userId, actorId: actor.userId, prompt: input.text,
      entityType: input.entityType, entityId: input.entityId,
    });
    return id;
  }

  async view(id: string, actor: AuthenticatedUser): Promise<ProcessView> {
    const process = await this.store.find(id);
    if (!process || process.userId !== actor.userId) throw new NotFoundException("Process not found");
    const [steps, entities] = await Promise.all([this.store.steps(id), this.store.entities(id)]);
    return toProcessView(process, steps, entities);
  }
}
