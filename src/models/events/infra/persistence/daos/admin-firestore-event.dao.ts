import type { Firestore } from "firebase-admin/firestore";
import type { EventDocument } from "../repositories/mappers/event-document.mapper";

export interface EventDao {
  create(documentData: EventDocument): Promise<void>;
  update(documentData: EventDocument): Promise<void>;
  delete(eventId: string): Promise<void>;
  findById(eventId: string): Promise<EventDocument | null>;
  findLatestOpenByUserId(userId: string): Promise<EventDocument | null>;
  list(filters?: EventDocumentFilters): Promise<EventDocument[]>;
}

export interface EventDocumentFilters {
  from?: string;
  to?: string;
  type?: EventDocument["type"];
  tag?: string;
}

export class AdminFirestoreEventDao implements EventDao {
  constructor(private readonly database: Firestore) {}

  async create(documentData: EventDocument): Promise<void> {
    await this.database.collection("events").doc(documentData.id).set(documentData);
  }

  async update(documentData: EventDocument): Promise<void> {
    const { createdAt: _createdAt, ...updateData } = documentData;
    await this.database.collection("events").doc(documentData.id).set(updateData, { merge: true });
  }

  async delete(eventId: string): Promise<void> {
    await this.database.collection("events").doc(eventId).delete();
  }

  async findById(eventId: string): Promise<EventDocument | null> {
    const snapshot = await this.database.collection("events").doc(eventId).get();
    return snapshot.exists ? (snapshot.data() as EventDocument) : null;
  }

  async findLatestOpenByUserId(userId: string): Promise<EventDocument | null> {
    const snapshot = await this.database
      .collection("events")
      .where("userId", "==", userId)
      .orderBy("startedAt", "desc")
      .get();
    return snapshot.docs
      .map((item) => item.data() as EventDocument)
      .find((event) => !event.finishedAt) ?? null;
  }

  async list(filters: EventDocumentFilters = {}): Promise<EventDocument[]> {
    let eventQuery: FirebaseFirestore.Query = this.database.collection("events");

    if (filters.type) eventQuery = eventQuery.where("type", "==", filters.type);
    if (filters.tag) eventQuery = eventQuery.where("tags", "array-contains", filters.tag);
    if (filters.from) eventQuery = eventQuery.where("startedAt", ">=", filters.from);
    if (filters.to) eventQuery = eventQuery.where("startedAt", "<=", filters.to);

    const snapshot = await eventQuery.orderBy("startedAt", "desc").get();
    return snapshot.docs.map((item) => item.data() as EventDocument);
  }
}
