import type { Firestore } from "firebase/firestore";
import { FirestoreTagDao } from "../persistence/daos/firestore-tag.dao";

export function makeFirestoreTagDao(database: Firestore): FirestoreTagDao {
  return new FirestoreTagDao(database);
}
