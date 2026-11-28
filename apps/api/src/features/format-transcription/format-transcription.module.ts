import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { LlmUnavailableError } from "../../api-core/agent/errors/agent.errors";
import type { StructuredCompletionGateway } from "../../api-core/agent/gateways/structured-completion.gateway";
import { ApiCoreModule } from "../../nest/api-core.module";
import { providerKeys } from "../../api-core/requests/model-catalog";
import { TRANSCRIPTION_FORMAT_JOB, type TranscriptionRequests } from "../../api-core/transcription/transcription-requests";
import { JobsService } from "../../infrastructure/jobs/jobs.service";
import { AnthropicStructuredCompletionGateway } from "../../infrastructure/model-agent/anthropic-structured.gateway";
import { TRANSCRIPTION_REQUESTS } from "../../infrastructure/persistence";
import { DailyReadingGate } from "../../api-core/tasks/daily-reading.gate";
import { SaveDailyReadingModule } from "../save-daily-reading/save-daily-reading.controller";
import { FormatTranscriptionUseCase } from "./format-transcription.usecase";

/** Sem chave da Anthropic neste ambiente, a formatação falha e o pedido termina `failed`, em vez de ficar parado. */
const NO_ANTHROPIC: StructuredCompletionGateway = {
  complete: () => Promise.reject(new LlmUnavailableError("O provedor anthropic não está ligado neste ambiente.")),
};

/** Registra o job interno `video-transcription-format` (spec #39, #46) no worker da fila única (ADR 0013). */
export class FormatTranscriptionJob {
  constructor(
    private readonly jobs: Pick<JobsService, "register">,
    private readonly format: FormatTranscriptionUseCase,
  ) {}

  start(): void {
    this.jobs.register(
      TRANSCRIPTION_FORMAT_JOB,
      async (raw, context) => {
        await this.format.run((raw as { requestId: string }).requestId, context.userId);
      },
      {
        // O job esgotou as tentativas: o pedido não fica em `running` para sempre.
        onFailure: async (raw, context) => {
          await this.format.fail((raw as { requestId: string }).requestId, context.userId);
        },
      },
    );
  }
}

/** Adaptador do lifecycle antigo: o registro do job tem `start` explicito. */
@Injectable()
export class FormatTranscriptionJobLifecycle implements OnModuleInit {
  constructor(@Inject(FormatTranscriptionJob) private readonly job: FormatTranscriptionJob) {}

  onModuleInit(): void {
    this.job.start();
  }
}

@Module({
  imports: [ApiCoreModule.forRoot(), SaveDailyReadingModule],
  providers: [
    {
      provide: FormatTranscriptionUseCase,
      inject: [DailyReadingGate, TRANSCRIPTION_REQUESTS],
      useFactory: (gate: DailyReadingGate, requests: TranscriptionRequests) => {
        const key = providerKeys().anthropic;
        return new FormatTranscriptionUseCase(gate, requests, key ? new AnthropicStructuredCompletionGateway(key) : NO_ANTHROPIC);
      },
    },
    {
      provide: FormatTranscriptionJob,
      inject: [JobsService, FormatTranscriptionUseCase],
      useFactory: (jobs: JobsService, format: FormatTranscriptionUseCase) => new FormatTranscriptionJob(jobs, format),
    },
    FormatTranscriptionJobLifecycle,
  ],
})
export class FormatTranscriptionModule {}
