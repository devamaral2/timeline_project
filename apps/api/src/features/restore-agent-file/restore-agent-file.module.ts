import { Module } from "@nestjs/common";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { RestoreAgentFileController } from "./restore-agent-file.controller";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [RestoreAgentFileController],
})
export class RestoreAgentFileModule {}
