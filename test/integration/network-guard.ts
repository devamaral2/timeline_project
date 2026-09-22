// Lightweight safety net. Outbound adapters still need explicit provider overrides
// in each integration test; MSW is reserved for browser E2E.
const originalFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error(`Integration test attempted an external HTTP call: ${url.origin}${url.pathname}`);
  }
  return originalFetch(input, init);
}) as typeof fetch;
