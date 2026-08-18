import type { Firestore } from "firebase-admin/firestore";
import { FirestoreEventRepository } from "../persistence/repositories/firestore-event.repository";
import { AdminFirestoreEventDao } from "../persistence/daos/admin-firestore-event.dao";

export function makeAdminFirestoreEventRepository(database: Firestore): FirestoreEventRepository {
  return new FirestoreEventRepository(new AdminFirestoreEventDao(database));
}
