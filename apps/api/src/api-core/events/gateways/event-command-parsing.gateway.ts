import type { CreateTaskInput } from "@repo/contracts";
import type { ParsedEventSchedule } from "../services/event-schedule.service";

export interface ParsedEventCommand {
  input: CreateTaskInput;
  schedule: ParsedEventSchedule;
  /** O lugar que a frase citou, como foi dito. Quem cria o evento procura o endereco no mapa. */
  place?: string;
  modelProvider: string;
  modelName: string;
}

export interface EventCommandParsingGateway {
  parseCommand(input: { text: string }): Promise<ParsedEventCommand>;
}
