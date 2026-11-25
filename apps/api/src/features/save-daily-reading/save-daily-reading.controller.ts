import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import type { DailyReadingResult } from "@repo/contracts";
import { dailyReadingInputSchema } from "@repo/contracts/schemas";
import { z } from "zod";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { ArtifactBuilder } from "../../api-core/artifacts/services/artifact-builder.service";
import { MaterializeRecurrencesUseCase } from "../../api-core/recurrences/materialize-recurrences.usecase";
import { CreateTaskUseCase } from "../../api-core/tasks/create-task.usecase";
import type { ArtifactRepository, EntityBatchWriter, TaskCardQuery, TaskRepository } from "../../domain/ports";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { ARTIFACT_REPOSITORY, ENTITY_BATCH_WRITER, TASK_CARD_QUERY, TASK_REPOSITORY } from "../../infrastructure/persistence";
import { SaveDailyReadingUseCase } from "./save-daily-reading.usecase";

/** O caminho da rota, tambem usado para dar a ela um corpo maior que o das demais. */
export const DAILY_READING_PATH = "/api/tasks/daily-reading";

/**
 * O corpo que a rota aceita: o markdown de uma pagina longa nao cabe nos 100 kB
 * padrao do Express. A folga sobre o teto do markdown cobre os escapes do JSON.
 */
export const DAILY_READING_BODY_LIMIT_BYTES = 1024 * 1024;

/**
 * `POST /api/tasks/daily-reading`: guarda uma pagina lida, ja em markdown, na
 * tarefa "Leitura diária" do dia. Quem manda e a extensao do navegador
 * (`apps/extension`).
 */
@Controller("api/tasks")
export class SaveDailyReadingController {
  constructor(@Inject(SaveDailyReadingUseCase) private readonly saveDailyReading: SaveDailyReadingUseCase) {}

  @Post("daily-reading")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.OK)
  execute(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<DailyReadingResult> {
    const parsed = dailyReadingInputSchema.safeParse(body);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    return this.saveDailyReading.execute(parsed.data, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [SaveDailyReadingController],
  providers: [{
    provide: SaveDailyReadingUseCase,
    inject: [TASK_CARD_QUERY, TASK_REPOSITORY, ARTIFACT_REPOSITORY, ArtifactBuilder, CreateTaskUseCase, ENTITY_BATCH_WRITER, MaterializeRecurrencesUseCase],
    useFactory: (
      cards: TaskCardQuery,
      tasks: TaskRepository,
      artifacts: ArtifactRepository,
      builder: ArtifactBuilder,
      createTask: CreateTaskUseCase,
      writer: EntityBatchWriter,
      recurrences: MaterializeRecurrencesUseCase,
    ) => new SaveDailyReadingUseCase(cards, tasks, artifacts, builder, createTask, writer, recurrences),
  }],
})
export class SaveDailyReadingModule {}
