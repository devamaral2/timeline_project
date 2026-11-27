import { transcriptionRequestInputSchema, transcriptionRequestResultSchema } from "@repo/contracts/schemas";
import type { TranscriptionRequestResult } from "@repo/contracts";
import { youtubeVideoOf } from "@/lib/notes/youtube";
import type { FakeArea, FakeRequest, FakeResult, FakeStore } from ".";

/**
 * Área do pedido de transcrição: `POST /api/tasks/transcription-requests`. Como a API, recusa com 400 o que não é
 * vídeo do YouTube e devolve o pedido que já espera quando o mesmo vídeo é pedido de novo.
 */

const REQUESTS = "transcriptionRequests";

type Stored = TranscriptionRequestResult & { id: string; videoId: string };

function request(req: FakeRequest, store: FakeStore): FakeResult {
  const { url } = req.body as { url: string };
  const video = youtubeVideoOf(url);
  if (!video) return { status: 400 };
  const table = store.table<Stored>(REQUESTS);
  const open = [...table.values()].find((entry) => entry.videoId === video.id);
  if (open) return { status: 200, body: { requestId: open.requestId, taskId: open.taskId, artifactId: open.artifactId, created: false } };
  const requestId = store.nextId("transcricao");
  const created: Stored = { id: requestId, videoId: video.id, requestId, taskId: "leitura-diaria", artifactId: store.nextId("video"), created: true };
  table.set(requestId, created);
  return { status: 200, body: { requestId, taskId: created.taskId, artifactId: created.artifactId, created: true } };
}

export const transcriptionArea: FakeArea = {
  name: "transcrição",
  routes: [
    {
      method: "POST",
      path: "/api/tasks/transcription-requests",
      input: transcriptionRequestInputSchema,
      output: transcriptionRequestResultSchema,
      handle: request,
    },
  ],
};
