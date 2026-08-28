import type { Firestore } from "firebase-admin/firestore";
import type { EventDocument } from "../mappers/event-document.mapper";

export interface EventDao {
  create(documentData: EventDocument): Promise<void>;
  createClosingLatestOpen(documentData: EventDocument, finishedAt: string): Promise<void>;
  update(documentData: EventDocument): Promise<void>;
  delete(eventId: string): Promise<void>;
  findById(eventId: string): Promise<EventDocument | null>;
  findLatestOpenByUserId(userId: string): Promise<EventDocument | null>;
  list(filters?: EventDocumentFilters): Promise<EventDocument[]>;
}

export interface EventDocumentFilters {
  userId?: string;
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

  async createClosingLatestOpen(
    documentData: EventDocument,
    finishedAt: string,
  ): Promise<void> {
    const events = this.database.collection("events");
    const latestEventQuery = events
      .where("userId", "==", documentData.userId)
      .orderBy("startedAt", "desc")
      .limit(1);

    await this.database.runTransaction(async (transaction) => {
      const latestEventSnapshot = await transaction.get(latestEventQuery);
      const latestEvent = latestEventSnapshot.docs[0];
      // Escritas fora de ordem (o evento anterior demorou mais no agente) fechariam o evento mais
      // recente com um finishedAt anterior ao seu startedAt, e a entidade rejeita isso em toda
      // leitura -- o que derrubaria a timeline inteira sem conserto pelo app.
      const closesInThePast = latestEvent
        ? finishedAt < (latestEvent.data().startedAt as string)
        : false;
      if (latestEvent && !latestEvent.data().finishedAt && !closesInThePast) {
        transaction.set(
          latestEvent.ref,
          { finishedAt, updatedAt: finishedAt },
          { merge: true },
        );
      }
      transaction.set(events.doc(documentData.id), documentData);
    });
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
      .limit(1)
      .get();
    const latestEvent = snapshot.docs[0]?.data() as EventDocument | undefined;
    return latestEvent && !latestEvent.finishedAt ? latestEvent : null;
  }

  async list(filters: EventDocumentFilters = {}): Promise<EventDocument[]> {
    let eventQuery: FirebaseFirestore.Query = this.database.collection("events");

    if (filters.userId) eventQuery = eventQuery.where("userId", "==", filters.userId);
    if (filters.type) eventQuery = eventQuery.where("type", "==", filters.type);
    if (filters.tag) eventQuery = eventQuery.where("tags", "array-contains", filters.tag);

    if (filters.from && filters.to) {
      // A uniao e disjunta pela data de inicio: a primeira consulta encontra
      // quem comecou dentro do intervalo; a segunda, quem comecou antes e
      // continuou nele. Documentos abertos nao entram na segunda consulta,
      // pois nao afirmamos ate quando um evento sem finishedAt se estende.
      const [startedInside, carriedInto] = await Promise.all([
        eventQuery
          .where("startedAt", ">=", filters.from)
          .where("startedAt", "<=", filters.to)
          .orderBy("startedAt", "desc")
          .get(),
        eventQuery
          .where("startedAt", "<", filters.from)
          .where("finishedAt", ">=", filters.from)
          // finishedAt e o primeiro campo de faixa para o indice descartar
          // cedo o historico que terminou antes do dia consultado.
          .orderBy("finishedAt", "asc")
          .orderBy("startedAt", "desc")
          .get(),
      ]);
      return [...startedInside.docs, ...carriedInto.docs]
        .map((item) => item.data() as EventDocument)
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
    }

    if (filters.from) eventQuery = eventQuery.where("startedAt", ">=", filters.from);
    if (filters.to) eventQuery = eventQuery.where("startedAt", "<=", filters.to);

    const snapshot = await eventQuery.orderBy("startedAt", "desc").get();
    return snapshot.docs.map((item) => item.data() as EventDocument);
  }
}
