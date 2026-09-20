import { Module } from "@nestjs/common";
import { AgentModule } from "./features/agent/agent.module";
import { EventsModule } from "./features/events/events.module";
import { RecurrencesModule } from "./features/recurrences/recurrences.module";
import { TasksModule } from "./features/tasks/tasks.module";

@Module({ imports: [EventsModule, TasksModule, RecurrencesModule, AgentModule] })
export class AppModule {}
