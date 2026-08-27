import { Module } from "@nestjs/common";
import type { Firestore } from "firebase-admin/firestore";
import { AdminFirestoreEventDao } from "./events/daos/admin-firestore-event.dao";
import { AdminFirestoreTagDao } from "./events/daos/admin-firestore-tag.dao";
import { FirestoreEventRepository } from "./events/repositories/firestore-event.repository";
import { FirestoreTagRepository } from "./events/repositories/firestore-tag.repository";
import { getAdminFirestore } from "./firebase/admin-firestore";

/**
 * Tokens de injecao. Sao strings, e nao symbols, porque o Nest os imprime tal
 * qual na mensagem de erro quando um provider nao resolve.
 *
 * As portas (`EventRepository`, `TagRepository`) sao interfaces e nao existem em
 * runtime — por isso quem as consome precisa de `@Inject(TOKEN)` explicito.
 */
export const FIRESTORE = "FIRESTORE";
export const EVENT_REPOSITORY = "EVENT_REPOSITORY";
export const TAG_REPOSITORY = "TAG_REPOSITORY";

@Module({
  providers: [
    {
      provide: FIRESTORE,
      useFactory: (): Firestore => getAdminFirestore(),
    },
    {
      provide: EVENT_REPOSITORY,
      inject: [FIRESTORE],
      useFactory: (database: Firestore) =>
        new FirestoreEventRepository(new AdminFirestoreEventDao(database)),
    },
    {
      provide: TAG_REPOSITORY,
      inject: [FIRESTORE],
      useFactory: (database: Firestore) =>
        new FirestoreTagRepository(new AdminFirestoreTagDao(database)),
    },
  ],
  exports: [FIRESTORE, EVENT_REPOSITORY, TAG_REPOSITORY],
})
export class PersistenceModule {}
