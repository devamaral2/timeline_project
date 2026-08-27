import { FieldPath, type Firestore } from "firebase-admin/firestore";
import type { TagDocument } from "../mappers/tag-document.mapper";

export interface TagDao {
  upsert(documentData: TagDocument): Promise<void>;
  suggest(queryText: string, maxResults: number): Promise<TagDocument[]>;
}

export class AdminFirestoreTagDao implements TagDao {
  constructor(private readonly database: Firestore) {}

  async upsert(documentData: TagDocument): Promise<void> {
    const tagReference = this.database.collection("tags").doc(documentData.id);
    const existing = await tagReference.get();
    const createdAt = existing.exists
      ? (existing.data() as TagDocument).createdAt
      : documentData.createdAt;

    await tagReference.set({ ...documentData, createdAt }, { merge: true });
  }

  async suggest(queryText: string, maxResults: number): Promise<TagDocument[]> {
    const normalized = queryText.trim().toLowerCase();
    const tags = this.database.collection("tags");
    const tagQuery = normalized
      ? tags.orderBy("name").startAt(normalized).endAt(`${normalized}\uf8ff`).limit(maxResults)
      : tags.orderBy(FieldPath.documentId()).limit(maxResults);
    const snapshot = await tagQuery.get();

    return snapshot.docs.map((item) => item.data() as TagDocument);
  }
}
