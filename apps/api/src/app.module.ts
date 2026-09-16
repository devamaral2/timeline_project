import { Module } from "@nestjs/common";
import { EventsModule } from "./events/events.module";
import { RecurrencesModule } from "./recurrences/recurrences.module";
import { TasksModule } from "./tasks/tasks.module";

@Module({ imports: [EventsModule, TasksModule, RecurrencesModule] })
export class AppModule {}
