import type { AgentScreenContext } from "@repo/contracts";
import { z } from "zod";
import { fill, promptsConfig as prompts } from "../config/agent-config";
import type { AgentSkill } from "../skills/agent-skill";

const TIME_ZONE = prompts.timeZone;

export interface AgentPromptInput {
  now: Date;
  context?: AgentScreenContext;
  schema: string;
  skills: readonly AgentSkill[];
  /** Chat: ha proxima rodada, entao o agente pode perguntar o que falta. */
  conversational?: boolean;
  /**
   * `chat_messages` esta no escopo desta chamada. Sem esta linha o modelo ve a
   * tabela na lista e nao pensa em usa-la: o gatilho ("ele citou algo dito
   * antes") nao esta no schema. Acompanha `ScopedSqlScope.includeChat`, senao o
   * prompt mandaria consultar uma tabela que nao existe para este ator.
   */
  chatMemory?: boolean;
  routed?: "read" | "write";
}

export class AgentPromptBuilderService {
  build(input: AgentPromptInput): string {
    if (input.routed) return this.buildRouted(input);
    const { legacy, rules } = prompts;
    const values = { now: formatNow(input.now), timeZone: TIME_ZONE };
    return [
      ...legacy.beforeRules,
      ...(input.conversational ? rules.conversation : rules.singleRequest),
      ...(input.chatMemory ? rules.chatMemory : []),
      ...legacy.afterRules.map((line) => fill(line, values)),
      "",
      describeContext(input.context),
      "",
      ...legacy.beforeSchema,
      input.schema,
      "",
      ...legacy.beforeSkills,
      ...input.skills.map((skill) => skill.instructions),
    ].join("\n");
  }

  private buildRouted(input: AgentPromptInput): string {
    const { routed, rules } = prompts;
    const values = { now: formatNow(input.now), timeZone: TIME_ZONE };
    return [
      ...routed.preamble.map((line) => fill(line, values)),
      describeContext(input.context),
      ...(input.chatMemory ? rules.chatMemory : []),
      ...routed.guidelines,
      input.routed === "read" ? routed.readOnly : routed.writeContract.join("\n"),
      routed.tablesHeading,
      input.schema,
      routed.skillsHeading,
      ...input.skills.map((skill) =>
        [
          skill.instructions,
          `${fill(routed.jsonSchemaLabel, { skill: skill.name })}${JSON.stringify(z.toJSONSchema(skill.parameters))}`,
        ].join("\n"),
      ),
    ].join("\n\n");
  }
}

function describeContext(context: AgentScreenContext | undefined): string {
  const { screenContext } = prompts;
  if (!context) return screenContext.none;
  const entity = context.entityId ? fill(screenContext.entitySuffix, { entityId: context.entityId }) : "";
  return screenContext.lines.map((line) => fill(line, { screen: context.screen, entity })).join("\n");
}

function formatNow(now: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    dateStyle: "full",
    timeStyle: "short",
  }).format(now);
}
