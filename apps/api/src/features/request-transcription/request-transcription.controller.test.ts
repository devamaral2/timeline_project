import "reflect-metadata";
import { describe, expect, test, vi } from "vitest";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { RequestTranscriptionController } from "./request-transcription.controller";
import type { RequestTranscriptionUseCase } from "./request-transcription.usecase";

const owner = { userId: "owner-1" };
const url = "https://youtu.be/dQw4w9WgXcQ";

describe("POST /api/tasks/transcription-requests", () => {
  test("entrega o link ao caso de uso e devolve o pedido", async () => {
    const result = { requestId: "p1", taskId: "t1", artifactId: "a1", created: true };
    const execute = vi.fn(async () => result);
    const controller = new RequestTranscriptionController({ execute } as unknown as RequestTranscriptionUseCase);

    await expect(controller.execute({ url }, owner)).resolves.toEqual(result);
    expect(execute).toHaveBeenCalledWith({ url }, owner);
  });

  test.each([{}, { url: "" }, { url: "javascript:alert(1)" }, { url, extra: true }, "texto"])("recusa o corpo %j sem chamar o caso de uso", (body) => {
    const execute = vi.fn();
    const controller = new RequestTranscriptionController({ execute } as unknown as RequestTranscriptionUseCase);

    expect(() => controller.execute(body, owner)).toThrow(InvalidInputError);
    expect(execute).not.toHaveBeenCalled();
  });
});
