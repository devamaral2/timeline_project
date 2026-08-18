import type { Firestore } from "firebase-admin/firestore";
import { FirestoreTagRepository } from "../persistence/repositories/firestore-tag.repository";
import { AdminFirestoreTagDao } from "../persistence/daos/admin-firestore-tag.dao";

export function makeAdminFirestoreTagRepository(database: Firestore): FirestoreTagRepository {
  return new FirestoreTagRepository(new AdminFirestoreTagDao(database));
}
