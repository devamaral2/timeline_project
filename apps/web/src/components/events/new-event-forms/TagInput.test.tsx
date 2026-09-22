import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TagSuggestionDto } from "@/lib/api/contracts";
import { TagInput } from "./TagInput";

const suggestions: TagSuggestionDto[] = [{ id: "tag-1", name: "treino" }];

beforeEach(() => {
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

test("asks for suggestions with the session — the tags belong to the user", async () => {
  type("tre");

  await waitFor(() => expect(fetch).toHaveBeenCalled());
  const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
  expect(url).toBe("/api/tags?query=tre&limit=6");
  expect(init.credentials).toBe("same-origin");
});

test("shows what the backend suggested", async () => {
  type("tre");

  expect(await screen.findByRole("button", { name: "treino" })).toBeInTheDocument();
});

test("a failed suggestion is not an error on the screen", async () => {
  // A sugestao e um atalho: quem esta digitando termina a tag na mao.
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
  type("tre");

  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(screen.queryByRole("button", { name: "treino" })).toBeNull();
  expect(screen.getByLabelText("Tags")).toBeInTheDocument();
});
