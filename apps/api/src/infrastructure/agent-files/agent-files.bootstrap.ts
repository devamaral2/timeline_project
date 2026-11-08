import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { AgentFilesService } from "../../api-core/agent/config/agent-files.service";
import { getServerEnv } from "../../config/env";

/** Com `AGENT_FILES_DIR`, carrega a pasta na subida e acompanha as edicoes; sem ela, vale o padrao de fabrica. */
@Injectable()
export class AgentFilesBootstrap implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(AgentFilesService) private readonly files: AgentFilesService) {}

  async onModuleInit(): Promise<void> {
    if (getServerEnv().AGENT_FILES_DIR) await this.files.start();
  }

  onModuleDestroy(): void {
    this.files.stop();
  }
}
