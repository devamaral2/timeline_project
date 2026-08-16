import type { Firestore } from "firebase/firestore";
import { FirestoreEventRepository } from "../persistence/repositories/firestore-event.repository";
import { makeFirestoreEventDao } from "./make-firestore-event-dao";

export function makeFirestoreEventRepository(database: Firestore): FirestoreEventRepository {
  return new FirestoreEventRepository(makeFirestoreEventDao(database));
}
