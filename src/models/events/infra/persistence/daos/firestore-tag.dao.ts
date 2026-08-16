import {
  collection,
  documentId,
  endAt,
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
    await setDoc(doc(this.database, "tags", documentData.id), documentData, { merge: true });
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
