import type {
  EventCommandParsingGateway,
  ParsedEventCommand,
} from "../../contracts/event-command-parsing.gateway";

export class StubEventCommandParsingGateway implements EventCommandParsingGateway {
  readonly calls: Array<{ text: string }> = [];

  constructor(
    private readonly response: ParsedEventCommand = {
      input: { type: "routine", name: "Rotina", tags: [] },
      schedule: {},
      modelProvider: "stub",
      modelName: "stub-model",
    },
  ) {}

  async parseCommand(input: { text: string }): Promise<ParsedEventCommand> {
    this.calls.push(input);
    return this.response;
  }
}
