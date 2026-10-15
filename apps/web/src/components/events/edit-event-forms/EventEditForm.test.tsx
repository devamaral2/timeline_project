import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { EventDetailDto, NoteDto } from "@/lib/api/contracts";
import { authedFetch } from "@/lib/api/authed-fetch";
import { noteOf } from "../note-fixtures";
import { EventEditForm } from "./EventEditForm";

vi.mock("@/lib/api/authed-fetch", () => ({ authedFetch: vi.fn() }));
vi.mock("../new-event-forms/TagInput", () => ({ TagInput: () => null }));

const linkedMeal = noteOf({ id: "meal-linked", type: "meal", name: "Almoço de ontem", data: {} });
const freeMeal = noteOf({ id: "meal-free", type: "meal", name: "Jantar leve", data: {} });
const sleepNote = noteOf({ id: "sleep-1", type: "sleep", name: "Noite de domingo", data: {} });
const textNote = noteOf({ id: "text-1", type: "text", name: "Lembrete", data: { body: "" } });

function aMealEvent(): EventDetailDto {
  return {
    id: "event-1",
    name: "Almoço",
    description: "",
    startedAt: "2026-09-14T15:00:00.000Z",
    tags: [],
    missed: false,
    priority: "normal",
    notifyOffsetsMinutes: [],
    interruptions: [],
    revision: 3,
    kind: "meal",
    notes: [linkedMeal],
  };
}

beforeEach(() => {
  vi.mocked(authedFetch).mockReset();
});

function patchBody(): Record<string, unknown> {
  const call = vi.mocked(authedFetch).mock.calls.find(([path]) => path === "/api/events/event-1");
  const init = call?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body));
}

function mockNotes(notes: NoteDto[]) {
  vi.mocked(authedFetch).mockImplementation(async (path: string) => {
    if (path === "/api/notes") return notes;
    return undefined;
  });
}

test("offers only unlinked notes of the event's type", async () => {
  mockNotes([linkedMeal, freeMeal, sleepNote, textNote]);
  render(<EventEditForm event={aMealEvent()} onCancel={() => {}} onClose={() => {}} onUpdated={() => {}} />);

  expect(await screen.findByLabelText("Jantar leve")).toBeTruthy();
  expect(screen.queryByLabelText("Almoço de ontem")).toBeNull();
  expect(screen.queryByLabelText("Noite de domingo")).toBeNull();
  expect(screen.queryByLabelText("Lembrete")).toBeNull();
});

test("says so when no note of the type is available", async () => {
  mockNotes([sleepNote, textNote]);
  render(<EventEditForm event={aMealEvent()} onCancel={() => {}} onClose={() => {}} onUpdated={() => {}} />);

  expect(await screen.findByText("Nenhuma nota de refeição disponível para associar.")).toBeTruthy();
});

test("saves the chosen note keeping the ones already on the event", async () => {
  mockNotes([freeMeal]);
  const onUpdated = vi.fn();
  render(<EventEditForm event={aMealEvent()} onCancel={() => {}} onClose={() => {}} onUpdated={onUpdated} />);

  fireEvent.click(await screen.findByLabelText("Jantar leve"));
  fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

  await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  const body = patchBody();
  expect(body.expectedRevision).toBe(3);
  expect(body.notes).toEqual([{ id: "meal-linked" }, { id: "meal-free" }]);
});

test("does not send notes when none was chosen", async () => {
  mockNotes([freeMeal]);
  const onUpdated = vi.fn();
  render(<EventEditForm event={aMealEvent()} onCancel={() => {}} onClose={() => {}} onUpdated={onUpdated} />);

  await screen.findByLabelText("Jantar leve");
  fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

  await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  expect(patchBody()).not.toHaveProperty("notes");
});
