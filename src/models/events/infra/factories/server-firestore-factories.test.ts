import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const serverFactoryFiles = [
  "src/models/events/infra/factories/make-create-event-controller.ts",
  "src/models/events/infra/factories/make-delete-event-controller.ts",
  "src/models/events/infra/factories/make-get-daily-overview-controller.ts",
  "src/models/events/infra/factories/make-list-timeline-events-controller.ts",
  "src/models/events/infra/factories/make-suggest-tags-controller.ts",
  "src/models/events/infra/factories/make-update-event-controller.ts",
];

test.each(serverFactoryFiles)(
  "server factory %s does not depend on the client firebase app helper",
  (relativePath) => {
    const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");

    expect(source.includes('from "@/lib/firebase/client-app"')).toBe(false);
    expect(source.includes("getClientApp(")).toBe(false);
    expect(source.includes('from "firebase/firestore"')).toBe(false);
  },
);
