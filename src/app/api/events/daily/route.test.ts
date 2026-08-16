import { afterEach, expect, test, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
});

test("returns a validation response from the daily events route when date is missing", async () => {
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "test-api-key");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "test.firebaseapp.com");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "test-project");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "test.appspot.com");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "1234567890");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "1:1234567890:web:test");

  const response = await GET(new Request("http://localhost/api/events/daily"));

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "date is required" });
});
