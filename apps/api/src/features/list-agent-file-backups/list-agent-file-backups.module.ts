import { Module } from "@nestjs/common";
import { ApiCoreModule } from "../../nest/api-core.module";
import { ListAgentFileBackupsController } from "./list-agent-file-backups.controller";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [ListAgentFileBackupsController],
})
export class ListAgentFileBackupsModule {}
