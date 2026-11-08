import { Module } from "@nestjs/common";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { RestoreAgentFilesFactoryController } from "./restore-agent-files-factory.controller";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [RestoreAgentFilesFactoryController],
})
export class RestoreAgentFilesFactoryModule {}
