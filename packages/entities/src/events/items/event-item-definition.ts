export interface EventItemDefinition<TData> {
  type: string;
  currentSchemaVersion: number;
  parse(data: unknown, schemaVersion: number): TData;
  incompatibleWith: readonly string[];
}
