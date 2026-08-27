import { afterEach, expect, test, vi } from "vitest";
import { getClientEnv } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

test("reads client firebase env from direct property access even when keys are not enumerable", () => {
  const source = new Proxy(
    {},
    {
      get: (_target, property) => {
        switch (property) {
          case "NEXT_PUBLIC_FIREBASE_API_KEY":
            return "test-api-key";
          case "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN":
            return "test.firebaseapp.com";
          case "NEXT_PUBLIC_FIREBASE_PROJECT_ID":
            return "test-project";
          case "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET":
            return "test.firebasestorage.app";
          case "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID":
            return "1234567890";
          case "NEXT_PUBLIC_FIREBASE_APP_ID":
            return "1:1234567890:web:test";
          default:
            return undefined;
        }
      },
      ownKeys: () => [],
      getOwnPropertyDescriptor: () => undefined,
    },
  ) as Record<string, string | undefined>;

  expect(getClientEnv(source)).toEqual({
    NEXT_PUBLIC_FIREBASE_API_KEY: "test-api-key",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "test-project",
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "test.firebasestorage.app",
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1234567890",
    NEXT_PUBLIC_FIREBASE_APP_ID: "1:1234567890:web:test",
  });
});
