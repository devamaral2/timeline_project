import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import type { EventAgentGateway, SkillExecutionResult } from "../gateways/event-agent.gateway";
import { EventAgentUndecidedError, InvalidInputError } from "../errors/event-agent.errors";
import { EventAgentPromptBuilderService } from "../services/event-agent-prompt-builder.service";
import { EVENT_SKILLS, findEventSkill } from "../skills/event-skill-registry";
import type { EventSkill } from "../skills/event-skill";
import type { CreateEventUseCase } from "./create-event.usecase";

export interface CreateEventFromTextResult {
  eventIds: string[];
  skillsUsed: string[];
  modelName: string;
}

export class CreateEventFromTextUseCase {
  constructor(
    private readonly agentGateway: EventAgentGateway,
    private readonly createEventUseCase: CreateEventUseCase,
    private readonly skills: readonly EventSkill[] = EVENT_SKILLS,
    private readonly promptBuilder = new EventAgentPromptBuilderService(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(
    input: { text: string },
    actor: AuthenticatedUser,
  ): Promise<CreateEventFromTextResult> {
    const text = input.text?.trim();
    if (!text) throw new InvalidInputError("O campo 'text' é obrigatório");

    const eventIds: string[] = [];
    const skillsUsed: string[] = [];

    const { modelName } = await this.agentGateway.run({
      text,
      systemPrompt: this.promptBuilder.build(this.skills, this.clock()),
      skills: this.skills,
      execute: async ({ name, args }) => {
        const result = await this.runSkill(name, args, actor);
        if (result.ok) {
          eventIds.push(result.eventId);
          skillsUsed.push(name);
        }
        return result;
      },
    });

    if (eventIds.length === 0) throw new EventAgentUndecidedError();

    return { eventIds, skillsUsed, modelName };
  }

  /**
   * Executa uma skill. Falhas previsíveis viram um resultado de erro que volta ao
   * modelo como tool result, para que ele corrija os argumentos na próxima rodada —
   * lançar aqui mataria o loop e desperdiçaria a tentativa.
   */
  private async runSkill(
    name: string,
    args: unknown,
    actor: AuthenticatedUser,
  ): Promise<SkillExecutionResult> {
    const skill = findEventSkill(name);
    if (!skill) return { ok: false, error: `Skill desconhecida: ${name}` };

    try {
      const { eventId } = await this.createEventUseCase.execute(
        skill.toCreateEventInput(args),
        actor,
      );
      return { ok: true, eventId };
    } catch (error) {
      console.error("[CreateEventFromTextUseCase] skill falhou", { skill: name, error });
      return { ok: false, error: describeFailure(error) };
    }
  }
}

function describeFailure(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Falha ao registrar o evento";
}
