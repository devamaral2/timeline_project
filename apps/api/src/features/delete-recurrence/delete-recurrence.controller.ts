import { Controller, Delete, HttpCode, HttpStatus, Inject, Module, Param, UseGuards } from "@nestjs/common";
import { RECURRENCE_REPOSITORY } from "../../infrastructure/persistence";
import type { RecurrenceRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { DeleteRecurrenceUseCase } from "./delete-recurrence.usecase";

@Controller("api/recurrences")
export class DeleteRecurrenceController {
  constructor(@Inject(DeleteRecurrenceUseCase) private readonly deleteRecurrence: DeleteRecurrenceUseCase) {}

  @Delete(":recurrenceId")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async execute(@Param("recurrenceId") recurrenceId: string, @CurrentUser() actor: AuthenticatedUser): Promise<void> {
    await this.deleteRecurrence.execute({ recurrenceId }, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [DeleteRecurrenceController],
  providers: [{
    provide: DeleteRecurrenceUseCase,
    inject: [RECURRENCE_REPOSITORY],
    useFactory: (recurrences: RecurrenceRepository) => new DeleteRecurrenceUseCase(recurrences),
  }],
})
export class DeleteRecurrenceModule {}
