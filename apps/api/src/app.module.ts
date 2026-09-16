import { Module } from "@nestjs/common";
import { EventsModule } from "./events/events.module";
import { TasksModule } from "./tasks/tasks.module";

@Module({ imports: [EventsModule, TasksModule] })
export class AppModule {}
