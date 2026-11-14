import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/authed-fetch";
import type { AgentFileData } from "@repo/contracts";
import type { AgentFileApi } from "@/lib/notes/agent-file-notes";
import { AgentFileNoteView } from "./AgentFileNoteView";

const data: AgentFileData = { path: "hermes/skills/deploy/SKILL.md", hash: "a".repeat(64), missing: false };

function apiOf(overrides: Partial<AgentFileApi> = {}): AgentFileApi {
  return {
    read: vi.fn().mockResolvedValue({ path: data.path, text: "# Deploy\nrode o script" }),
    ...overrides,
  };
}

test("shows the path, the version and the file text", async () => {
  render(<AgentFileNoteView data={data} api={apiOf()} />);
  expect(screen.getByText(data.path)).toBeTruthy();
  expect(screen.getByText("aaaaaaaa")).toBeTruthy();
  expect((await screen.findByLabelText("Texto do arquivo")).textContent).toContain("rode o script");
});

test("renders the markdown by default and shows the raw text on demand", async () => {
  const text = "---\nname: deploy\n---\n# Deploy\n\n- **rode** o script";
  render(<AgentFileNoteView data={data} api={apiOf({ read: vi.fn().mockResolvedValue({ path: data.path, text }) })} />);
  const view = await screen.findByLabelText("Texto do arquivo");
  expect(view.querySelector("h2")?.textContent).toBe("Deploy");
  expect(view.querySelector("strong")?.textContent).toBe("rode");
  expect(view.textContent).toContain("name: deploy");
  fireEvent.click(screen.getByRole("button", { name: "Texto bruto" }));
  const raw = screen.getByLabelText("Texto do arquivo");
  expect(raw.tagName).toBe("PRE");
  expect(raw.textContent).toBe(text);
});

test("flags a file that disappeared from the folder", () => {
  render(<AgentFileNoteView data={{ ...data, missing: true }} api={apiOf()} />);
  expect(screen.getByText(/arquivo ausente/)).toBeTruthy();
});

test("says who may read the text when the API answers 403", async () => {
  const api = apiOf({ read: vi.fn().mockRejectedValue(new ApiError(403, "forbidden")) });
  render(<AgentFileNoteView data={data} api={api} />);
  expect((await screen.findByRole("alert")).textContent).toContain("Só o dono");
});
