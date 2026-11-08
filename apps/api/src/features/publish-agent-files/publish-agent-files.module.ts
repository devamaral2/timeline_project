import { Module } from "@nestjs/common";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { PublishAgentFilesController } from "./publish-agent-files.controller";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [PublishAgentFilesController],
})
export class PublishAgentFilesModule {}
