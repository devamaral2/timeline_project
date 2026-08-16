import type { TagSuggestionDto } from "../../../../application/contracts/tag-repository";

export interface TagDocument {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export class TagDocumentMapper {
  static toPersistence(name: string, createdBy: string): TagDocument {
    const now = new Date().toISOString();
    return { id: name, name, createdBy, createdAt: now, updatedAt: now };
  }

  static toSuggestion(document: TagDocument): TagSuggestionDto {
    return { id: document.id, name: document.name };
  }
}
