import { Module } from "@nestjs/common";
import { ApiCoreModule } from "../../nest/api-core.module";
import { ListAgentFilesController } from "./list-agent-files.controller";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [ListAgentFilesController],
})
export class ListAgentFilesModule {}
