import { Module } from "@nestjs/common";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { ReloadAgentFilesController } from "./reload-agent-files.controller";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [ReloadAgentFilesController],
})
export class ReloadAgentFilesModule {}
