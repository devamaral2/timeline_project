import { BadRequestException, Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import type { DailyOverviewDto } from "@repo/contracts";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { GetDailyOverviewUseCase } from "./get-daily-overview.usecase";

@Controller("api/events")
export class GetDailyOverviewController {
  constructor(@Inject(GetDailyOverviewUseCase) private readonly getDailyOverview: GetDailyOverviewUseCase) {}

  @Get("daily")
  @UseGuards(GatewayIdentityGuard)
  execute(@CurrentUser() actor: AuthenticatedUser, @Query("date") date?: string): Promise<DailyOverviewDto> {
    if (!date) throw new BadRequestException("date is required");
    return this.getDailyOverview.execute({ date }, actor);
  }
}
