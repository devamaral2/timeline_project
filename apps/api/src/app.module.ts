import { Module } from "@nestjs/common";
import { EventsModule } from "./events/events.module";
import { PlansModule } from "./plans/plans.module";
import { TasksModule } from "./tasks/tasks.module";

@Module({ imports: [EventsModule, PlansModule, TasksModule] })
export class AppModule {}
