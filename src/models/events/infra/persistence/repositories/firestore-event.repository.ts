import type { EventRepository, DomainEvent } from "../../../application/contracts/event-repository";
import type { EventDao } from "../daos/admin-firestore-event.dao";
import { EventDocumentMapper } from "./mappers/event-document.mapper";

export class FirestoreEventRepository implements EventRepository {
  constructor(private readonly eventDao: EventDao) {}

  async save(event: DomainEvent): Promise<void> {
    await this.eventDao.create(EventDocumentMapper.toPersistence(event));
  }

  async saveClosingLatestOpen(event: DomainEvent, finishedAt: Date): Promise<void> {
    await this.eventDao.createClosingLatestOpen(
      EventDocumentMapper.toPersistence(event),
      finishedAt.toISOString(),
    );
  }

  async update(event: DomainEvent, actorUserId: string): Promise<void> {
    const storedEvent = await this.eventDao.findById(event.id);
    if (!storedEvent) return;
    this.assertOwner(storedEvent.userId, actorUserId);
    await this.eventDao.update(EventDocumentMapper.toPersistence(event));
  }

  async delete(eventId: string, actorUserId: string): Promise<void> {
    const event = await this.eventDao.findById(eventId);
    if (!event) return;
    this.assertOwner(event.userId, actorUserId);
    await this.eventDao.delete(eventId);
  }

  async findById(eventId: string): Promise<DomainEvent | null> {
    const document = await this.eventDao.findById(eventId);
    return document ? EventDocumentMapper.toDomain(document) : null;
  }

  async findLatestOpenByUserId(userId: string): Promise<DomainEvent | null> {
    const document = await this.eventDao.findLatestOpenByUserId(userId);
    return document ? EventDocumentMapper.toDomain(document) : null;
  }

  async listTimeline(params: Parameters<EventRepository["listTimeline"]>[0]): Promise<DomainEvent[]> {
    const documents = await this.eventDao.list({
      userId: params.userId,
      from: params.from?.toISOString(),
      to: params.to?.toISOString(),
      type: params.type,
      tag: params.tag,
    });
    return documents.map(EventDocumentMapper.toDomain);
  }

  async listByDay(params: Parameters<EventRepository["listByDay"]>[0]): Promise<DomainEvent[]> {
    const documents = await this.eventDao.list();
    return documents
      .filter((document) => {
        const startedDate = dateInTimeZone(document.startedAt, params.timeZone);
        const finishedDate = dateInTimeZone(document.finishedAt ?? document.startedAt, params.timeZone);
        return startedDate <= params.date && finishedDate >= params.date;
      })
      .map(EventDocumentMapper.toDomain);
  }

  private assertOwner(ownerUserId: string, actorUserId: string): void {
    if (ownerUserId !== actorUserId) {
      throw new Error("Only the event owner can modify it");
    }
  }
}

function dateInTimeZone(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
