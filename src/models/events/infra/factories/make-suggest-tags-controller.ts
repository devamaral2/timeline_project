import { getFirestore } from "firebase/firestore";
import { getClientApp } from "@/lib/firebase/client-app";
import { SuggestTagsUseCase } from "../../application/usecases/suggest-tags.usecase";
import { SuggestTagsController } from "../http/controller/suggest-tags.controller";
import { makeFirestoreTagRepository } from "./make-firestore-tag-repository";

export function makeSuggestTagsController(): SuggestTagsController {
  const repository = makeFirestoreTagRepository(getFirestore(getClientApp()));
  return new SuggestTagsController(new SuggestTagsUseCase(repository));
}
