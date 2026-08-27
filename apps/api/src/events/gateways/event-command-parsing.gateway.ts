import type { CreateEventInput } from "@repo/entities/contracts";
import type { ParsedEventSchedule } from "../services/event-schedule.service";

export interface ParsedEventCommand {
  input: CreateEventInput;
  schedule: ParsedEventSchedule;
  modelProvider: string;
  modelName: string;
}

export interface EventCommandParsingGateway {
  parseCommand(input: { text: string }): Promise<ParsedEventCommand>;
}
