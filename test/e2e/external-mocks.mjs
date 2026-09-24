import { http, HttpResponse, passthrough } from "msw";
import { setupServer } from "msw/node";

// This file is preloaded only by the E2E Auth/API child processes.
// Add explicit service-specific handlers here when a scenario needs them.
const internalOrigins = new Set(
  [process.env.API_SERVICE_URL, process.env.AUTH_PUBLIC_URL, process.env.AUTH_WEB_APP_URL, process.env.AUDIO_TRANSCRIPTION_URL]
    .filter(Boolean)
    .map((value) => new URL(value).origin),
);
const server = setupServer(
  // Voice tests exercise transcription and automatic chat submission, even if the LLM is down.
  http.post("https://openrouter.ai/api/v1/*", () => HttpResponse.json({ error: { message: "E2E unavailable" } }, { status: 503 })),
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
