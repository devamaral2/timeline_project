import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { SuggestTagsUseCase } from "../../application/usecases/suggest-tags.usecase";
import { SuggestTagsController } from "../http/controller/suggest-tags.controller";
import { makeAdminFirestoreTagRepository } from "./make-admin-firestore-tag-repository";

export function makeSuggestTagsController(): SuggestTagsController {
  const repository = makeAdminFirestoreTagRepository(getAdminFirestore());
  return new SuggestTagsController(new SuggestTagsUseCase(repository));
}
