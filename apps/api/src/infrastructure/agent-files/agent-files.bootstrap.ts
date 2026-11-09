import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { AgentFileNotesReconciler } from "../../api-core/agent/config/agent-file-notes.reconciler";
import { AgentFilesService } from "../../api-core/agent/config/agent-files.service";
import { RouterNotesReconciler } from "../../api-core/process/jev-router-notes";
import { getServerEnv } from "../../config/env";

/**
 * Mantem as notas `router` dos JEVs em dia. Com `AGENT_FILES_DIR`, carrega a pasta na subida, acompanha as edicoes do Hermes e mantem as notas
 * `skill`/`agent` em dia; sem ela, nada acontece.
 */
@Injectable()
export class AgentFilesBootstrap implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(AgentFilesService) private readonly files: AgentFilesService,
    @Inject(AgentFileNotesReconciler) private readonly reconciler: AgentFileNotesReconciler,
    @Inject(RouterNotesReconciler) private readonly routerNotes: RouterNotesReconciler,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.routerNotes.sync();
    if (!getServerEnv().AGENT_FILES_DIR) return;
    await this.files.start();
    await this.reconciler.start();
  }

  onModuleDestroy(): void {
    this.files.stop();
  }
}
