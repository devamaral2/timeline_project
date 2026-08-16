import type { Firestore } from "firebase/firestore";
import { FirestoreTagRepository } from "../persistence/repositories/firestore-tag.repository";
import { makeFirestoreTagDao } from "./make-firestore-tag-dao";

export function makeFirestoreTagRepository(database: Firestore): FirestoreTagRepository {
  return new FirestoreTagRepository(makeFirestoreTagDao(database));
}
