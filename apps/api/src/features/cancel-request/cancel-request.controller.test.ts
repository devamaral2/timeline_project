import "reflect-metadata";
import { describe, expect, test, vi } from "vitest";
import type { RequestOperations } from "../../api-core/requests/request-operations";
import type { CancelTranscriptionUseCase } from "../request-transcription/cancel-transcription.usecase";
import { CancelRequestController } from "./cancel-request.controller";

const owner = { userId: "owner-1" };

function setup(kind: string) {
  const order: string[] = [];
  const operations = {
    view: vi.fn(async () => ({ id: "r1", kind })),
    cancel: vi.fn(async () => {
      order.push("cancel");
      return { id: "r1", status: "cancel" };
    }),
  };
  const transcription = {
    execute: vi.fn(async () => {
      order.push("transcription");
      return true;
    }),
  };
  const controller = new CancelRequestController(
    operations as unknown as RequestOperations,
    transcription as unknown as CancelTranscriptionUseCase,
  );
  return { controller, operations, transcription, order };
}

describe("POST /api/requests/:requestId/cancel", () => {
  test("o pedido de transcrição acerta o documento e a leitura antes de o pedido ser devolvido", async () => {
    const { controller, transcription, order } = setup("save_content_with_transcription");

    await expect(controller.cancel("r1", owner)).resolves.toEqual({ id: "r1", status: "cancel" });

    expect(transcription.execute).toHaveBeenCalledWith("r1", owner);
    expect(order).toEqual(["transcription", "cancel"]);
  });

  test.each(["request", "save_content"])("o pedido do tipo %s só cancela o pedido", async (kind) => {
    const { controller, transcription, operations } = setup(kind);

    await controller.cancel("r1", owner);

    expect(transcription.execute).not.toHaveBeenCalled();
    expect(operations.cancel).toHaveBeenCalledWith("r1", owner);
  });
});
