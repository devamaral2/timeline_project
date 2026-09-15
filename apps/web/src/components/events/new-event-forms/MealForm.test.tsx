import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MealForm } from "./MealForm";


beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ eventId: "e-1" }))));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function submitWith(text: string): void {
  render(<MealForm onBack={() => {}} onClose={() => {}} onCreated={() => {}} />);
  fireEvent.change(screen.getByLabelText(/o que você comeu/i), { target: { value: text } });
  fireEvent.submit(screen.getByRole("button", { name: "Criar evento" }).closest("form")!);
}

function sentBody(): Record<string, unknown> {
  const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

test("sends one meal item, and no event type at all", async () => {
  submitWith("2 ovos mexidos");

  await waitFor(() => expect(fetch).toHaveBeenCalled());
  const body = sentBody();

  // O evento nao tem tipo — tem itens. `type: "food"` era o mundo anterior.
  expect(body).not.toHaveProperty("type");
  expect(body.items).toEqual([{ type: "meal", data: { inputText: "2 ovos mexidos" } }]);
});

test("sends the session of the signed in user", async () => {
  submitWith("café com leite");

  await waitFor(() => expect(fetch).toHaveBeenCalled());
  const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
  expect(init.credentials).toBe("same-origin");
});

test("asks for the meal before sending anything", () => {
  submitWith("   ");

  expect(screen.getByText("Descreva o que você comeu.")).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
