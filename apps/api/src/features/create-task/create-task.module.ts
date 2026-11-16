import { Module } from "@nestjs/common";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { CreateTaskController } from "./create-task.controller";

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [CreateTaskController] })
export class CreateTaskModule {}
