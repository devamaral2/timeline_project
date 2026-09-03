import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TagSuggestionDto } from "@repo/entities/contracts";
import { TagInput } from "./TagInput";

const user = { getIdToken: async () => "test-token" };
let signedIn: typeof user | null = user;

vi.mock("firebase/auth", () => ({
  getAuth: () => ({
    get currentUser() {
      return signedIn;
    },
  }),
}));
vi.mock("@/lib/firebase/client-app", () => ({ getClientApp: () => ({}) }));

const suggestions: TagSuggestionDto[] = [{ id: "tag-1", name: "treino" }];

beforeEach(() => {
  signedIn = user;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(suggestions))));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function type(value: string) {
  render(<TagInput tags={[]} onTagsChange={() => {}} />);
  fireEvent.change(screen.getByLabelText("Tags"), { target: { value } });
}

test("asks for suggestions with the token — the tags belong to the user", async () => {
  type("tre");

  await waitFor(() => expect(fetch).toHaveBeenCalled());
  const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
  expect(url).toBe("/api/tags?query=tre&limit=6");
  expect(init.headers).toMatchObject({ Authorization: "Bearer test-token" });
});

test("shows what the backend suggested", async () => {
  type("tre");

  expect(await screen.findByRole("button", { name: "treino" })).toBeInTheDocument();
});

test("a failed suggestion is not an error on the screen", async () => {
  // A sugestao e um atalho: quem esta digitando termina a tag na mao.
  signedIn = null;
  type("tre");

  await waitFor(() => expect(screen.queryByRole("button", { name: "treino" })).toBeNull());
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Tags")).toBeInTheDocument();
});
