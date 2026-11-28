import { AgentFileArtifactsReconciler } from "../../api-core/agent/config/agent-file-artifacts.reconciler";
import { AgentFilesService } from "../../api-core/agent/config/agent-files.service";
import { RouterArtifactsReconciler } from "../../api-core/requests/jev-router-artifacts";
import { getServerEnv } from "../../config/env";

/**
 * Mantem os artefatos `router` dos JEVs em dia. Com `AGENT_FILES_DIR`, carrega a pasta na subida, acompanha as
 * edicoes do Hermes e mantem os artefatos `skill`/`agent` em dia; sem ela, nada acontece.
 *
 * O startup e o shutdown sao explicitos: o adaptador do lifecycle do processo chama `start` e `stop`.
 */
export class AgentFilesBootstrap {
  constructor(
    private readonly files: AgentFilesService,
    private readonly reconciler: AgentFileArtifactsReconciler,
    private readonly routerArtifacts: RouterArtifactsReconciler,
  ) {}

  async start(): Promise<void> {
    await this.routerArtifacts.sync();
    if (!getServerEnv().AGENT_FILES_DIR) return;
    await this.files.start();
    await this.reconciler.start();
  }

  stop(): void {
    this.files.stop();
  }
}
