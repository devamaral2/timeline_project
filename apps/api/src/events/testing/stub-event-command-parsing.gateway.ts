import type {
  EventCommandParsingGateway,
  ParsedEventCommand,
} from "../gateways/event-command-parsing.gateway";

export class StubEventCommandParsingGateway implements EventCommandParsingGateway {
  readonly calls: Array<{ text: string }> = [];

  constructor(
    private readonly response: ParsedEventCommand = {
      input: { name: "Rotina", items: [{ type: "routine" }], tags: [] },
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
