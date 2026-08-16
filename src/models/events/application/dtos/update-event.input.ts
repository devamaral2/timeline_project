import type { CreateEventInput } from "./create-event.input";

export type UpdateEventInput = CreateEventInput & { eventId: string };
