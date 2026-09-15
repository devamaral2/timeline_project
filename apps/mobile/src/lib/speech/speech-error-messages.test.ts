import { expect, test } from "vitest";
import { speechErrorMessage } from "./speech-error-messages";

test("hides the message when the user aborted on purpose", () => {
  expect(speechErrorMessage("aborted")).toBeNull();
});

test("translates a denied microphone or speech permission", () => {
  expect(speechErrorMessage("not-allowed")).toMatch(/microfone/i);
  expect(speechErrorMessage("service-not-allowed")).toMatch(/microfone/i);
});

test("translates silence and capture failures", () => {
  expect(speechErrorMessage("no-speech")).toMatch(/não ouvi/i);
  expect(speechErrorMessage("speech-timeout")).toMatch(/não ouvi/i);
  expect(speechErrorMessage("audio-capture")).toMatch(/microfone/i);
});

test("falls back to a generic message for unknown codes", () => {
  expect(speechErrorMessage("unknown")).toBe("Não foi possível gravar o áudio.");
  expect(speechErrorMessage("interrupted")).toBe("Não foi possível gravar o áudio.");
});
