import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  writeBatch,
  type Firestore,
  where,
} from "firebase/firestore";
import type { EventDocument } from "../repositories/mappers/event-document.mapper";

export interface EventDocumentFilters {
  from?: string;
  to?: string;
  type?: EventDocument["type"];
  tag?: string;
}

export class FirestoreEventDao {
  constructor(private readonly database: Firestore) {}

  async create(documentData: EventDocument): Promise<void> {
    await setDoc(doc(this.database, "events", documentData.id), documentData);
  }

  async createClosingLatestOpen(
    documentData: EventDocument,
    finishedAt: string,
  ): Promise<void> {
    const latestEvent = await this.findLatestOpenByUserId(documentData.userId);
    const batch = writeBatch(this.database);
    if (latestEvent) {
      batch.set(
        doc(this.database, "events", latestEvent.id),
        { finishedAt, updatedAt: finishedAt },
        { merge: true },
      );
    }
    batch.set(doc(this.database, "events", documentData.id), documentData);
    await batch.commit();
  }

  async update(documentData: EventDocument): Promise<void> {
    const { createdAt: _createdAt, ...updateData } = documentData;
    await setDoc(doc(this.database, "events", documentData.id), updateData, { merge: true });
  }

  async delete(eventId: string): Promise<void> {
    await deleteDoc(doc(this.database, "events", eventId));
  }

  async findById(eventId: string): Promise<EventDocument | null> {
    const snapshot = await getDoc(doc(this.database, "events", eventId));
    return snapshot.exists() ? (snapshot.data() as EventDocument) : null;
  }

  async findLatestOpenByUserId(userId: string): Promise<EventDocument | null> {
    const snapshot = await getDocs(
      query(
        collection(this.database, "events"),
        where("userId", "==", userId),
        orderBy("startedAt", "desc"),
        limit(1),
      ),
    );
    const latestEvent = snapshot.docs[0]?.data() as EventDocument | undefined;
    return latestEvent && !latestEvent.finishedAt ? latestEvent : null;
  }

  async list(filters: EventDocumentFilters = {}): Promise<EventDocument[]> {
    const constraints = [];
    if (filters.type) constraints.push(where("type", "==", filters.type));
    if (filters.tag) constraints.push(where("tags", "array-contains", filters.tag));
    if (filters.from) constraints.push(where("startedAt", ">=", filters.from));
    if (filters.to) constraints.push(where("startedAt", "<=", filters.to));
    constraints.push(orderBy("startedAt", "desc"));

    const snapshot = await getDocs(query(collection(this.database, "events"), ...constraints));
    return snapshot.docs.map((item) => item.data() as EventDocument);
  }
}
