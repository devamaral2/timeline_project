import { Module } from "@nestjs/common";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { CreateEventController } from "./create-event.controller";

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [CreateEventController] })
export class CreateEventModule {}
