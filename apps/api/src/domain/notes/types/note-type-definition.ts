export interface NoteTypeDefinition<TData> {
  type: string;
  currentSchemaVersion: number;
  parse(data: unknown, schemaVersion: number): TData;
}
