import type { EventSkill } from "../skills/event-skill";

const EVENT_TIME_ZONE = "America/Sao_Paulo";

export class EventAgentPromptBuilderService {
  build(skills: readonly EventSkill[], now: Date): string {
    return [
      "Você registra eventos na timeline pessoal do usuário a partir do que ele escreve.",
      "",
      "Regras:",
      "- Acione a skill que corresponde ao que o usuário relatou. Se ele relatou mais de uma",
      "  atividade no mesmo texto, acione uma skill por atividade.",
      "- Extraia apenas o que está no texto. Nunca invente valores que o usuário não informou.",
      "- Converta as unidades exatamente como cada skill exige.",
      "- Se o texto não descrever nenhuma atividade registrável, não acione skill nenhuma e",
      "  responda explicando o que faltou.",
      "- Não pergunte nada ao usuário: não há segunda rodada de conversa.",
      "",
      `Momento atual do usuário: ${formatNow(now)} (${EVENT_TIME_ZONE}).`,
      "O horário do evento é definido automaticamente pelo sistema — não tente defini-lo.",
      "",
      "Skills disponíveis:",
      "",
      ...skills.map((skill) => skill.instructions),
    ].join("\n");
  }
}

function formatNow(now: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: EVENT_TIME_ZONE,
    dateStyle: "full",
    timeStyle: "short",
  }).format(now);
}
