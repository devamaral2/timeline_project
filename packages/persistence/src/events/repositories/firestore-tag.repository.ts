import type { LegacyTagRepository, TagSuggestionDto } from "@repo/entities/ports";
import type { TagDao } from "../daos/admin-firestore-tag.dao";
import { TagDocumentMapper } from "../mappers/tag-document.mapper";

export class FirestoreTagRepository implements LegacyTagRepository {
  constructor(private readonly tagDao: TagDao) {}

  async upsertMany(tags: string[], createdBy: string): Promise<void> {
    await Promise.all(
      [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].map((name) =>
        this.tagDao.upsert(TagDocumentMapper.toPersistence(name, createdBy)),
      ),
    );
  }

  async suggest(params: Parameters<LegacyTagRepository["suggest"]>[0]): Promise<TagSuggestionDto[]> {
    const documents = await this.tagDao.suggest(params.query, params.limit);
    return documents.map(TagDocumentMapper.toSuggestion);
  }
}
