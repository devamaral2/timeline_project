import { Module } from "@nestjs/common";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { ReadAgentFileController } from "./read-agent-file.controller";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [ReadAgentFileController],
})
export class ReadAgentFileModule {}
