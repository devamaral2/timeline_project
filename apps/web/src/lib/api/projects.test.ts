import { beforeEach, expect, test, vi } from "vitest";
import { createFakeApi } from "@/test/fake-api";
import { FAKE_PERSONAL_PROJECT, projectsArea } from "@/test/fake-api/projects";
import { ApiRequestError } from "./client-request";
import { createProject, listProjects } from "./projects";

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

let api: ReturnType<typeof createFakeApi>;

beforeEach(() => {
  api = createFakeApi({ areas: [projectsArea] });
  net.authedFetch.mockImplementation(api.authedFetch);
});

test("listProjects reads the projects of the user, personal first", async () => {
  expect(await listProjects()).toEqual([FAKE_PERSONAL_PROJECT]);
});

test("createProject sends the name to POST /api/projects and answers with the project, listed after personal", async () => {
  const created = await createProject("timeline_project");

  expect(created).toEqual({ id: expect.any(String), name: "timeline_project", personal: false });
  expect(api.calls.at(-1)).toMatchObject({ method: "POST", pathname: "/api/projects", body: { name: "timeline_project" } });
  expect(await listProjects()).toEqual([FAKE_PERSONAL_PROJECT, created]);
});

test("the others come by name, whatever the order they were created in", async () => {
  await createProject("zeta");
  await createProject("Alfa");

  expect((await listProjects()).map((project) => project.name)).toEqual(["personal", "Alfa", "zeta"]);
});

test("a repeated name is a conflict, with no regard to case or the spaces at the ends", async () => {
  await createProject("Braid");

  await expect(createProject(" braid ")).rejects.toMatchObject({ kind: "conflict", status: 409 });
  await expect(createProject("PERSONAL")).rejects.toBeInstanceOf(ApiRequestError);
});

test.each(["", "   ", "a".repeat(61)])("an invalid name is refused as invalid input: %j", async (name) => {
  await expect(createProject(name)).rejects.toMatchObject({ kind: "invalid_input", status: 400 });
});
