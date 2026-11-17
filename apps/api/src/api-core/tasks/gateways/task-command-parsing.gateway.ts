import type { CreateTaskInput } from "@repo/contracts";
import type { ParsedTaskSchedule } from "../services/task-schedule.service";

export interface ParsedTaskCommand {
  input: CreateTaskInput;
  schedule: ParsedTaskSchedule;
  /** O lugar que a frase citou, como foi dito. Quem cria a tarefa procura o endereco no mapa. */
  place?: string;
  modelProvider: string;
  modelName: string;
}

export interface TaskCommandParsingGateway {
  parseCommand(input: { text: string }): Promise<ParsedTaskCommand>;
}
