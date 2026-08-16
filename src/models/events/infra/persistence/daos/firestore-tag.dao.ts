import {
  collection,
  documentId,
  endAt,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAt,
  doc,
  type Firestore,
} from "firebase/firestore";
import type { TagDocument } from "../repositories/mappers/tag-document.mapper";

export class FirestoreTagDao {
  constructor(private readonly database: Firestore) {}

  async upsert(documentData: TagDocument): Promise<void> {
    const tagReference = doc(this.database, "tags", documentData.id);
    const existing = await getDoc(tagReference);
    const createdAt = existing.exists()
      ? (existing.data() as TagDocument).createdAt
      : documentData.createdAt;
    await setDoc(tagReference, { ...documentData, createdAt }, { merge: true });
  }

  async suggest(queryText: string, maxResults: number): Promise<TagDocument[]> {
    const normalized = queryText.trim().toLowerCase();
    const tags = collection(this.database, "tags");
    const tagQuery = normalized
      ? query(tags, orderBy("name"), startAt(normalized), endAt(`${normalized}\uf8ff`), limit(maxResults))
      : query(tags, orderBy(documentId()), limit(maxResults));
    const snapshot = await getDocs(tagQuery);
    return snapshot.docs.map((item) => item.data() as TagDocument);
  }
}
