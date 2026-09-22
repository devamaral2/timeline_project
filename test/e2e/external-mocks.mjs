import { http, HttpResponse, passthrough } from "msw";
import { setupServer } from "msw/node";

// This file is preloaded only by the E2E Auth/API child processes.
// Add explicit service-specific handlers here when a scenario needs them.
const internalOrigins = new Set(
  [process.env.API_SERVICE_URL, process.env.AUTH_PUBLIC_URL, process.env.AUTH_WEB_APP_URL]
    .filter(Boolean)
    .map((value) => new URL(value).origin),
);
const server = setupServer(
  http.get("https://api.pwnedpasswords.com/range/:prefix", () =>
    new HttpResponse("", { status: 200 }),
  ),
  http.all("*", ({ request }) => {
    const url = new URL(request.url);
    if (internalOrigins.has(url.origin)) return passthrough();
    throw new Error(`Unmocked external request: ${request.method} ${request.url}`);
  }),
);

server.listen({ onUnhandledRequest: "error" });

process.once("SIGTERM", () => server.close());
