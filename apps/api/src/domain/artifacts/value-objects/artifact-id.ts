import { ulid } from "ulid";

export class ArtifactId {
  static create(): string {
    return ulid();
  }
}
