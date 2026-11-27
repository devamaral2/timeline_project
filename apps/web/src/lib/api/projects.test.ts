import { beforeEach, expect, test, vi } from "vitest";
import { createFakeApi } from "@/test/fake-api";
import { FAKE_PERSONAL_PROJECT, projectsArea } from "@/test/fake-api/projects";
import { listProjects } from "./projects";

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

beforeEach(() => {
  const api = createFakeApi({ areas: [projectsArea] });
  net.authedFetch.mockImplementation(api.authedFetch);
});

test("listProjects reads the projects of the user, personal first", async () => {
  expect(await listProjects()).toEqual([FAKE_PERSONAL_PROJECT]);
});
