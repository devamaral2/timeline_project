import { Module } from "@nestjs/common";
import { PersistenceModule, RECURRENCE_REPOSITORY, TASK_REPOSITORY } from "@repo/persistence";
import type { RecurrenceRepository, TaskRepository } from "@repo/entities/ports";
import { EventsModule } from "../events/events.module";
import { CreateEventUseCase } from "../events/usecases/create-event.usecase";
import { RecurrencesController } from "./http/recurrences.controller";
import { CreateRecurrenceUseCase } from "./usecases/create-recurrence.usecase";
import { DeleteRecurrenceUseCase } from "./usecases/delete-recurrence.usecase";
import { GetRecurrenceUseCase, ListRecurrencesUseCase } from "./usecases/get-recurrence.usecase";
import { UpdateRecurrenceUseCase } from "./usecases/update-recurrence.usecase";

@Module({
  imports: [PersistenceModule, EventsModule],
  controllers: [RecurrencesController],
  providers: [
    {
      provide: ListRecurrencesUseCase,
      inject: [RECURRENCE_REPOSITORY],
      useFactory: (recurrences: RecurrenceRepository) => new ListRecurrencesUseCase(recurrences),
    },
    {
      provide: GetRecurrenceUseCase,
      inject: [RECURRENCE_REPOSITORY],
      useFactory: (recurrences: RecurrenceRepository) => new GetRecurrenceUseCase(recurrences),
    },
    {
      provide: CreateRecurrenceUseCase,
      inject: [RECURRENCE_REPOSITORY, CreateEventUseCase, TASK_REPOSITORY],
      useFactory: (recurrences: RecurrenceRepository, createEvent: CreateEventUseCase, tasks: TaskRepository) =>
        new CreateRecurrenceUseCase(recurrences, createEvent, tasks),
    },
    {
      provide: UpdateRecurrenceUseCase,
      inject: [RECURRENCE_REPOSITORY, CreateEventUseCase, TASK_REPOSITORY],
      useFactory: (recurrences: RecurrenceRepository, createEvent: CreateEventUseCase, tasks: TaskRepository) =>
        new UpdateRecurrenceUseCase(recurrences, createEvent, tasks),
    },
    {
      provide: DeleteRecurrenceUseCase,
      inject: [RECURRENCE_REPOSITORY],
      useFactory: (recurrences: RecurrenceRepository) => new DeleteRecurrenceUseCase(recurrences),
    },
  ],
})
export class RecurrencesModule {}
