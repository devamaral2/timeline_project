import { Module } from "@nestjs/common";
import { AgentModule } from "./agent/agent.module";
import { EventsModule } from "./events/events.module";
import { RecurrencesModule } from "./recurrences/recurrences.module";
import { TasksModule } from "./tasks/tasks.module";

@Module({ imports: [EventsModule, TasksModule, RecurrencesModule, AgentModule] })
export class AppModule {}
