import { Module, type DynamicModule } from "@nestjs/common";
import { AgentFilesService } from "../api-core/agent/config/agent-files.service";
import { RequestOperations } from "../api-core/requests/request-operations";
import { AgentFilesBootstrap } from "../infrastructure/agent-files/agent-files.bootstrap";
import { JobsService } from "../infrastructure/jobs/jobs.service";
import type { ApiRuntime } from "../server/composition-root";

/**
 * Adaptador temporario do Nest para a coexistencia: expoe ao container as
 * instancias que o composition root ja criou, para que as rotas que ainda vivem
 * no Nest usem o mesmo worker, o mesmo registro de handlers e o mesmo servico de
 * arquivos do Fastify — nunca uma segunda instancia.
 */
@Module({})
export class ApiRuntimeModule {
  static forRoot(runtime: Pick<ApiRuntime, "jobs" | "requestOperations" | "agentFiles" | "agentFilesBootstrap">): DynamicModule {
    const providers = [
      { provide: JobsService, useValue: runtime.jobs },
      { provide: RequestOperations, useValue: runtime.requestOperations },
      { provide: AgentFilesService, useValue: runtime.agentFiles },
      { provide: AgentFilesBootstrap, useValue: runtime.agentFilesBootstrap },
    ];
    return {
      global: true,
      module: ApiRuntimeModule,
      providers,
      exports: [JobsService, RequestOperations, AgentFilesService, AgentFilesBootstrap],
    };
  }
}
