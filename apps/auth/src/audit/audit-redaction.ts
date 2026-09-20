import type { AuditEventInput, AuditMetadataValue } from "./audit-event";

const sensitive = /password|otp|code|token|secret|authorization|cookie|privatekey/i;
const maxDepth = 5; const maxEntries = 50; const maxString = 1024;
function assertValue(value: unknown, depth: number): asserts value is AuditMetadataValue {
  if (depth > maxDepth) throw new Error("audit metadata exceeds maximum depth");
  if (value === null || typeof value === "boolean" || typeof value === "number") return;
  if (typeof value === "string") { if (value.length > maxString) throw new Error("audit metadata string too large"); return; }
  if (Array.isArray(value)) { if (value.length > maxEntries) throw new Error("audit metadata has too many entries"); value.forEach((item) => assertValue(item, depth + 1)); return; }
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) throw new Error("audit metadata must be JSON data");
  const entries = Object.entries(value);
  if (entries.length > maxEntries) throw new Error("audit metadata has too many entries");
  for (const [key, child] of entries) { if (sensitive.test(key)) throw new Error(`sensitive audit metadata key: ${key}`); assertValue(child, depth + 1); }
}
export function assertSafeAuditEvent(event: AuditEventInput): void { assertValue(event.metadata, 0); }
