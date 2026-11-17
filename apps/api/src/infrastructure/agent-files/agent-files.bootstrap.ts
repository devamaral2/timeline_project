import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { AgentFileArtifactsReconciler } from "../../api-core/agent/config/agent-file-artifacts.reconciler";
import { AgentFilesService } from "../../api-core/agent/config/agent-files.service";
import { RouterArtifactsReconciler } from "../../api-core/requests/jev-router-artifacts";
import { getServerEnv } from "../../config/env";

/**
 * Mantem os artefatos `router` dos JEVs em dia. Com `AGENT_FILES_DIR`, carrega a pasta na subida, acompanha as
 * edicoes do Hermes e mantem os artefatos `skill`/`agent` em dia; sem ela, nada acontece.
 */
@Injectable()
export class AgentFilesBootstrap implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(AgentFilesService) private readonly files: AgentFilesService,
    @Inject(AgentFileArtifactsReconciler) private readonly reconciler: AgentFileArtifactsReconciler,
    @Inject(RouterArtifactsReconciler) private readonly routerArtifacts: RouterArtifactsReconciler,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.routerArtifacts.sync();
    if (!getServerEnv().AGENT_FILES_DIR) return;
    await this.files.start();
    await this.reconciler.start();
  }

  onModuleDestroy(): void {
    this.files.stop();
  }
}
