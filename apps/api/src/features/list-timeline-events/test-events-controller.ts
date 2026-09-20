import { BadRequestException, HttpException, HttpStatus, NotFoundException } from "@nestjs/common";
import type { CreateEventInput, UpdateEventInput } from "@repo/contracts";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { CreateEventFromTranscriptUseCase } from "../create-event-from-transcript/create-event-from-transcript.usecase";
import type { CreateEventUseCase } from "../../api-core/events/create-event.usecase";
import type { DeleteEventUseCase } from "../delete-event/delete-event.usecase";
import type { GetDailyOverviewUseCase } from "../get-daily-overview/get-daily-overview.usecase";
import type { GetEventUseCase } from "../get-event/get-event.usecase";
import type { ListTimelineEventsUseCase } from "./list-timeline-events.usecase";
import type { UpdateEventUseCase } from "../update-event/update-event.usecase";
import { assertEventMarks, assertEventWindow, assertExpectedRevision, assertTimelineCursor, parseLimit } from "../../api-core/http-input-validation";

/** Compatibilidade de teste para os testes de fluxo legados; nao e controller Nest. */
export class EventsController {
  constructor(
    private readonly listTimelineEvents: ListTimelineEventsUseCase,
    private readonly createEvent: CreateEventUseCase,
    private readonly getDailyOverview: GetDailyOverviewUseCase,
    private readonly createEventFromTranscript: CreateEventFromTranscriptUseCase,
    private readonly getEvent: GetEventUseCase,
    private readonly updateEvent: UpdateEventUseCase,
    private readonly deleteEvent: DeleteEventUseCase,
  ) {}

  async list(
    actor: AuthenticatedUser,
    from?: string,
    to?: string,
    type?: string,
    tag?: string,
    cursor?: string,
    limit?: string,
  ) {
    if (from && Number.isNaN(new Date(from).getTime())) throw new BadRequestException("Invalid from date");
    if (to && Number.isNaN(new Date(to).getTime())) throw new BadRequestException("Invalid to date");
    if (cursor !== undefined) assertTimelineCursor(cursor);
    return this.listTimelineEvents.execute({ from, to, type, tag, cursor, limit: parseLimit(limit) }, actor);
  }
  async create(body: CreateEventInput, actor: AuthenticatedUser) {
    assertEventMarks(body);
    assertEventWindow(body);
    return this.createEvent.execute(body, actor);
  }
  async daily(actor: AuthenticatedUser, date?: string) {
    if (!date) throw new BadRequestException("date is required");
    return this.getDailyOverview.execute({ date }, actor);
  }
  async fromTranscript(body: { transcript?: string }, actor: AuthenticatedUser) {
    try {
      return await this.createEventFromTranscript.execute({ transcript: body.transcript ?? "" }, actor);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const message = error instanceof Error ? error.message : "Invalid request";
      throw new HttpException(message, message === "Transcript is required" || message === "Transcript is too long" ? HttpStatus.BAD_REQUEST : HttpStatus.BAD_GATEWAY);
    }
  }
  async detail(eventId: string, actor: AuthenticatedUser) {
    const event = await this.getEvent.execute({ eventId }, actor);
    if (!event) throw new NotFoundException("Event not found");
    return event;
  }
  async update(eventId: string, body: UpdateEventInput, actor: AuthenticatedUser) {
    assertEventMarks(body);
    assertEventWindow(body);
    assertExpectedRevision(body);
    return this.updateEvent.execute({ ...body, eventId }, actor);
  }
  async remove(eventId: string, actor: AuthenticatedUser) { return this.deleteEvent.execute({ eventId }, actor); }
}
