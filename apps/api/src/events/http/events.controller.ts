import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type {
  CreateEventInput,
  DailyOverviewDto,
  EventDetailDto,
  TimelineEventPageDto,
  UpdateEventInput,
} from "@repo/entities/contracts";
import { isEventPriority } from "@repo/entities";
import { decodeTimelineCursor } from "@repo/persistence";
import { CurrentUser } from "../../auth/current-user.decorator";
import { FirebaseAuthGuard } from "../../auth/firebase-auth.guard";
import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import { InvalidInputError } from "../errors/event-agent.errors";
import { CreateEventFromTextUseCase } from "../usecases/create-event-from-text.usecase";
import {
  CreateEventFromTranscriptUseCase,
  EMPTY_TRANSCRIPT_ERROR,
  LONG_TRANSCRIPT_ERROR,
} from "../usecases/create-event-from-transcript.usecase";
import { CreateEventUseCase } from "../usecases/create-event.usecase";
import { DeleteEventUseCase } from "../usecases/delete-event.usecase";
import { GetDailyOverviewUseCase } from "../usecases/get-daily-overview.usecase";
import { GetEventUseCase } from "../usecases/get-event.usecase";
import { ListTimelineEventsUseCase } from "../usecases/list-timeline-events.usecase";
import { UpdateEventUseCase } from "../usecases/update-event.usecase";

/** Mensagens que representam entrada invalida do cliente, e nao falha do modelo. */
const TRANSCRIPT_BAD_REQUEST = new Set<string>([EMPTY_TRANSCRIPT_ERROR, LONG_TRANSCRIPT_ERROR]);

const MAX_LIMIT = 100;

/**
 * IMPORTANTE: o Nest casa rotas na ordem de declaracao. `daily`, `ai` e `voice`
 * precisam vir antes de `:eventId`, senao o parametro dinamico captura os tres.
 * O roteamento por arquivo do Next escondia esse detalhe.
 */
@Controller("api/events")
export class EventsController {
  constructor(
    private readonly listTimelineEvents: ListTimelineEventsUseCase,
    private readonly createEvent: CreateEventUseCase,
    private readonly getDailyOverview: GetDailyOverviewUseCase,
    private readonly createEventFromText: CreateEventFromTextUseCase,
    private readonly createEventFromTranscript: CreateEventFromTranscriptUseCase,
    private readonly getEvent: GetEventUseCase,
    private readonly updateEvent: UpdateEventUseCase,
    private readonly deleteEvent: DeleteEventUseCase,
  ) {}

  @Get()
  @UseGuards(FirebaseAuthGuard)
  async list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("type") type?: string,
    @Query("tag") tag?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ): Promise<TimelineEventPageDto> {
    if (from && Number.isNaN(new Date(from).getTime())) {
      throw new BadRequestException("Invalid from date");
    }
    if (to && Number.isNaN(new Date(to).getTime())) {
      throw new BadRequestException("Invalid to date");
    }
    if (cursor !== undefined) assertValidCursor(cursor);

    return this.listTimelineEvents.execute(
      { from, to, type, tag, cursor, limit: parseLimit(limit) },
      actor,
    );
  }

  @Post()
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateEventInput,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ eventId: string }> {
    assertValidMarks(body);
    return this.createEvent.execute(body, actor);
  }

  @Get("daily")
  @UseGuards(FirebaseAuthGuard)
  async daily(
    @CurrentUser() actor: AuthenticatedUser,
    @Query("date") date?: string,
  ): Promise<DailyOverviewDto> {
    if (!date) throw new BadRequestException("date is required");
    return this.getDailyOverview.execute({ date }, actor);
  }

  @Post("ai")
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async fromText(
    @Body() body: { text?: unknown },
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<unknown> {
    if (typeof body?.text !== "string") {
      throw new InvalidInputError("O campo 'text' é obrigatório e deve ser uma string");
    }
    return this.createEventFromText.execute({ text: body.text }, actor);
  }

  @Post("voice")
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async fromTranscript(
    @Body() body: { transcript?: string },
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ eventId: string; primaryItemType: string }> {
    try {
      return await this.createEventFromTranscript.execute(
        { transcript: body?.transcript ?? "" },
        actor,
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const message = error instanceof Error ? error.message : "Invalid request";
      // Falha do modelo ou do banco nao e culpa do cliente: 502 deixa o retry na UI fazer sentido.
      throw new HttpException(
        message,
        TRANSCRIPT_BAD_REQUEST.has(message) ? HttpStatus.BAD_REQUEST : HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Get(":eventId")
  @UseGuards(FirebaseAuthGuard)
  async detail(
    @Param("eventId") eventId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<EventDetailDto> {
    const event = await this.getEvent.execute({ eventId }, actor);
    if (!event) throw new NotFoundException("Event not found");
    return event;
  }

  @Patch(":eventId")
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param("eventId") eventId: string,
    @Body() body: UpdateEventInput,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    assertValidMarks(body);
    assertValidExpectedRevision(body);
    await this.updateEvent.execute({ ...body, eventId }, actor);
  }

  @Delete(":eventId")
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param("eventId") eventId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.deleteEvent.execute({ eventId }, actor);
  }
}

/**
 * O corpo chega tipado, mas tipo nao e validacao: nada impede um cliente de
 * mandar `missed: "sim"`. A leitura devolveria o padrao e o usuario nunca
 * entenderia por que a anotacao dele sumiu — melhor recusar aqui.
 */
function assertValidMarks(body: { missed?: unknown; priority?: unknown }): void {
  if (body?.missed !== undefined && typeof body.missed !== "boolean") {
    throw new BadRequestException("Invalid missed flag");
  }
  if (body?.priority !== undefined && !isEventPriority(body.priority)) {
    throw new BadRequestException("Invalid event priority");
  }
}

function assertValidExpectedRevision(body: { expectedRevision?: unknown }): void {
  if (!Number.isInteger(body?.expectedRevision) || (body.expectedRevision as number) < 1) {
    throw new BadRequestException("Invalid expectedRevision");
  }
}

function assertValidCursor(cursor: string): void {
  try {
    decodeTimelineCursor(cursor);
  } catch {
    throw new BadRequestException("Invalid cursor");
  }
}

function parseLimit(raw?: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    throw new BadRequestException("Invalid limit");
  }
  return value;
}
