export const CATALOG_SCOPES = ["global", "user"] as const;

export type CatalogScope = (typeof CATALOG_SCOPES)[number];

export function isCatalogScope(value: unknown): value is CatalogScope {
  return CATALOG_SCOPES.includes(value as CatalogScope);
}
