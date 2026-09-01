import { Controller, Get, Inject } from "@nestjs/common";
import type { AuthDatabase } from "../db/client";
import { AUTH_DATABASE } from "../db/tokens";
import { checkReadiness } from "../db/readiness";

@Controller("health")
export class HealthController {
  constructor(@Inject(AUTH_DATABASE) private readonly db: AuthDatabase) {}
  @Get("live")
  live(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  async ready(): Promise<{ status: "ok" }> {
    await checkReadiness(this.db, 1);
    return { status: "ok" };
  }
}
