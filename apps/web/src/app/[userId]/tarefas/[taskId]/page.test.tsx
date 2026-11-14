import { beforeEach, expect, test, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

const { default: TaskPage } = await import("./page");

beforeEach(() => {
  redirect.mockReset();
});

test("o endereço antigo de tarefa leva à rota de evento com o mesmo id", async () => {
  await TaskPage({ params: Promise.resolve({ userId: "user-1", taskId: "t-1" }) });

  expect(redirect).toHaveBeenCalledWith("/user-1/eventos/t-1");
});
