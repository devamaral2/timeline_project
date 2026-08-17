import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
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
      query(collection(this.database, "events"), where("userId", "==", userId), orderBy("startedAt", "desc")),
    );
    return snapshot.docs
      .map((item) => item.data() as EventDocument)
      .find((event) => !event.finishedAt) ?? null;
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
