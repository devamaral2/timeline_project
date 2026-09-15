import { expect, test, vi } from "vitest";
import { describeVoiceEventError } from "./use-voice-event-queue";

// use-voice-event-queue importa authedFetch de @/lib/api/client, que por sua
// vez importa @/config/env (expo-constants) e @/lib/firebase/app (firebase) —
// os dois mocados aqui pela mesma razao de client.test.ts: sao modulos de
// runtime nativo que o Vitest nao consegue resolver fora do aparelho.
vi.mock("@/config/env", () => ({ env: { apiBaseUrl: "http://10.0.0.2:3001" } }));
vi.mock("@/lib/firebase/app", () => ({ getClientAuth: () => ({ currentUser: null }) }));

test("translates an expired session", () => {
  expect(describeVoiceEventError({ status: 401 })).toBe("Sessão expirada. Entre novamente.");
});

test("translates a transcript the agent could not parse", () => {
  expect(describeVoiceEventError({ status: 400 })).toBe("Não entendi o que você falou.");
});

test("falls back to a generic message for other API status codes", () => {
  expect(describeVoiceEventError({ status: 502 })).toBe("O agente não respondeu. Tente de novo.");
});

test("falls back to a generic message for a non-status error", () => {
  expect(describeVoiceEventError(new Error("network down"))).toBe(
    "O agente não respondeu. Tente de novo.",
  );
});
