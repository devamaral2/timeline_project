/**
 * Fixtures do pedido de transcrição de vídeo do YouTube (spec #39): o corpo e a resposta de
 * `POST /api/tasks/transcription-requests` validados pelos schemas do contrato, os textos que o chat e o botão
 * "Adicionar vídeo" do web mostram, a Leitura diária que o detalhe reconhece e as saídas de `soleYouTubeVideoLink` e
 * `isDailyReading` para as mesmas entradas que o app recebe.
 */
import "../css-stub";
import {
  taskSchema,
  transcriptionRequestInputSchema,
  transcriptionRequestResultSchema,
} from "../../../packages/contracts/src/schemas";
import { soleYouTubeVideoLink } from "../../../apps/web/src/lib/notes/youtube";
import { TRANSCRIPTION_TEXTS } from "../../../apps/web/src/lib/transcription/texts";
import { isDailyReading } from "../../../apps/web/src/lib/tasks/daily-reading";
import { PERSONAL_PROJECT } from "./project";

const VIDEO = "https://youtu.be/dQw4w9WgXcQ";

const MESSAGES = [
  VIDEO,
  `  ${VIDEO}  `,
  `\n${VIDEO}\t`,
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90",
  "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://www.youtube.com/shorts/dQw4w9WgXcQ",
  `resuma ${VIDEO}`,
  `${VIDEO} resuma`,
  `${VIDEO} ${VIDEO}`,
  "https://www.youtube.com/@canal",
  "https://www.youtube.com/playlist?list=PL123",
  "https://www.youtube.com/watch?v=curto",
  "https://exemplo.dev/watch?v=dQw4w9WgXcQ",
  "youtu.be/dQw4w9WgXcQ",
  "isto não é um link",
  "",
  "   ",
];

const NAMES = ["Leitura diária", "leitura Diaria", "  LEITURA   DIÁRIA ", "Leitura", "Leituras diárias", "Comprar pão", ""];

const dailyReading = taskSchema.parse({
  id: "task-leitura",
  actor: "human",
  kind: "common",
  name: "Leitura diária",
  status: "todo",
  priority: "medium",
  description: "",
  project: PERSONAL_PROJECT,
  longRunning: false,
  startedAt: "2026-09-14T21:00:00.000Z",
  notifyOffsetsMinutes: [],
  tags: [],
  artifactTypes: [],
  revision: 3,
  createdAt: "2026-09-14T12:00:00.000Z",
  updatedAt: "2026-09-14T12:00:00.000Z",
  artifacts: [],
  subtaskIds: [],
  requests: [],
});

export function transcriptionFixtures(): Record<string, unknown> {
  return {
    "transcription-texts": TRANSCRIPTION_TEXTS,
    "transcription-request-body": transcriptionRequestInputSchema.parse({ url: VIDEO }),
    "transcription-request-created": transcriptionRequestResultSchema.parse({
      requestId: "req-video-1",
      taskId: "task-leitura",
      artifactId: "doc-video-1",
      created: true,
    }),
    "transcription-request-again": transcriptionRequestResultSchema.parse({
      requestId: "req-video-1",
      taskId: "task-leitura",
      artifactId: "doc-video-1",
      created: false,
    }),
    "task-detail-daily-reading": dailyReading,
    "task-detail-daily-reading-reloaded": { ...dailyReading, revision: 4, updatedAt: "2026-09-14T13:00:00.000Z" },
    "transcription-functions": {
      soleYouTubeVideoLink: MESSAGES.map((text) => ({ args: [text], result: soleYouTubeVideoLink(text) })),
      isDailyReading: NAMES.map((name) => ({ args: [name], result: isDailyReading({ actor: "human", name }) })),
    },
  };
}
