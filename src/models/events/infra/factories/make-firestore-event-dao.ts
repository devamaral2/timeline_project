import type { Firestore } from "firebase/firestore";
import { FirestoreEventDao } from "../persistence/daos/firestore-event.dao";

export function makeFirestoreEventDao(database: Firestore): FirestoreEventDao {
  return new FirestoreEventDao(database);
}
