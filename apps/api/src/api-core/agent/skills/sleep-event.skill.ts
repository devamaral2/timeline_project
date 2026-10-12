import { z } from "zod";
import type { SleepItem } from "../../../domain";
import { skillText } from "../config/agent-config";
import { defineAgentSkill, fail } from "./agent-skill";
import { eventBaseFields, toBaseChanges, toCreateEventInput } from "./event-skill-fields";

export const sleepEventSkill = defineAgentSkill({
  name: "save_sleep_event",
  ...skillText("save_sleep_event"),
  parameters: z.object({
    ...eventBaseFields,
    trackedSleepTime: z
      .number()
      .nonnegative()
      .optional()
      .describe("Tempo dormido em MINUTOS. Obrigatório na criação."),
    score: z.number().min(0).max(100).optional().describe("Nota de qualidade do sono, de 0 a 100."),
  }),
  run: async (args, { session }) => {
    if (!args.id) {
      if (args.trackedSleepTime === undefined) return fail("trackedSleepTime é obrigatório para criar um sono.");
      return session.createEvent(
        toCreateEventInput(args, "sleep", {
          type: "sleep",
          data: { trackedSleepTime: args.trackedSleepTime, score: args.score ?? 0 },
        }),
      );
    }

    return session.updateEvent(args.id, "sleep", async (current) => {
      const existing = await session.noteOfType(current, "sleep");
      const previous = existing?.data as SleepItem | undefined;
      const hasChange = args.trackedSleepTime !== undefined || args.score !== undefined;
      if (!hasChange) return current.revise(toBaseChanges(args));

      const data: SleepItem = {
        trackedSleepTime: args.trackedSleepTime ?? previous?.trackedSleepTime ?? 0,
        score: args.score ?? previous?.score ?? 0,
      };
      if (existing) {
        await session.reviseNoteById(existing.id, (note) => note.revise({ data }));
        return current.revise(toBaseChanges(args));
      }

      // Um sono sem note ainda: a note de sono nasce agora e passa a fazer parte do evento.
      const created = await session.buildNote({ type: "sleep", data }, current.startedAt);
      session.stageNewNote(created);
      return current.revise({
        ...toBaseChanges(args),
        noteLinks: [...current.noteLinks, { noteId: created.id, fromRecurrence: false }],
      });
    });
  },
});
