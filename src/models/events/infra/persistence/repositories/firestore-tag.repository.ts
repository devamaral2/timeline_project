import type { TagRepository, TagSuggestionDto } from "../../../application/contracts/tag-repository";
import { FirestoreTagDao } from "../daos/firestore-tag.dao";
import { TagDocumentMapper } from "./mappers/tag-document.mapper";

export class FirestoreTagRepository implements TagRepository {
  constructor(private readonly tagDao: FirestoreTagDao) {}

  async upsertMany(tags: string[], createdBy: string): Promise<void> {
    await Promise.all(
      [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].map((name) =>
        this.tagDao.upsert(TagDocumentMapper.toPersistence(name, createdBy)),
      ),
    );
  }

  async suggest(params: Parameters<TagRepository["suggest"]>[0]): Promise<TagSuggestionDto[]> {
    const documents = await this.tagDao.suggest(params.query, params.limit);
    return documents.map(TagDocumentMapper.toSuggestion);
  }
}
