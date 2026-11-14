import { Logger } from "@nestjs/common";
import { Artifact } from "../../domain";
import type { ArtifactRepository } from "../../domain/ports";
import { candidatesConfig, dispatchConfig, linkConfig } from "./request-config";

export interface RouterArtifactSpec {
  name: string;
  body: string;
  tags: string[];
}

const bullets = (record: Record<string, string>) => Object.entries(record).map(([key, text]) => `- **${key}**: ${text}`).join("\n");

function commonParams(config: { endpoint: string; model: string; timeoutMs: number; minCertainty: number }): string {
  return [
    `- Endpoint: \`${config.endpoint}\``,
    `- Modelo: \`${config.model}\``,
    `- Timeout: ${config.timeoutMs} ms`,
    `- Certeza mínima: ${config.minCertainty}`,
  ].join("\n");
}

/** Um artefato `router` por JEV da rota por passos (ADR 003), escrito a partir dos mesmos parametros que o servidor usa. */
export function jevRouterArtifacts(): RouterArtifactSpec[] {
  const dispatchQuestions = Object.entries(dispatchConfig.questions)
    .map(([key, question]) => `### \`${key}\`\n\n${question.instructions}\n\n${bullets(question.criteria)}`)
    .join("\n\n");
  return [
    {
      name: "JEV · Despacho",
      tags: ["jev", "despacho"],
      body: [
        "# JEV · Despacho",
        "Parâmetros de `jev/dispatch.json`. Uma chamada, uma pergunta por operação × entidade, todas respondidas em paralelo; o resultado diz quais agentes o pedido aciona.",
        `${commonParams(dispatchConfig)}\n- Política de incerteza: \`${dispatchConfig.uncertainPolicy}\` (\`fallback\`: resposta incerta em qualquer pergunta manda o pedido ao fallback; \`ignore\`: conta como nenhum)`,
        "## Perguntas",
        dispatchQuestions,
      ].join("\n\n"),
    },
    {
      name: "JEV · Vínculo",
      tags: ["jev", "vinculo"],
      body: [
        "# JEV · Vínculo",
        "Parâmetros de `jev/link.json`. Decide se a entidade recém-concluída deve ser ligada a outra criada no mesmo pedido.",
        `${commonParams(linkConfig)}\n- Máximo de candidatas: ${linkConfig.maxCandidates}`,
        "## Pergunta",
        linkConfig.question.instructions,
        `- **Nenhuma**: ${linkConfig.question.none}`,
      ].join("\n\n"),
    },
    {
      name: "JEV · Candidatas de edição",
      tags: ["jev", "edicao"],
      body: [
        "# JEV · Candidatas de edição",
        "Parâmetros de `jev/candidates.json`. Escolhe, dentre a lista curta montada pelo servidor, quais entidades um pedido de edição altera; uma pergunta binária por candidata, respondidas em paralelo.",
        commonParams(candidatesConfig),
        "## Pergunta",
        candidatesConfig.question.instructions,
        bullets(candidatesConfig.question.criteria),
      ].join("\n\n"),
    },
  ];
}

/**
 * Mantem os artefatos `router` do dono em dia com os JSONs do JEV: cria os que faltam e reescreve o texto
 * quando o JSON mudou. O texto e do servidor, entao os artefatos sao somente leitura.
 */
export class RouterArtifactsReconciler {
  private readonly logger = new Logger(RouterArtifactsReconciler.name);

  constructor(
    private readonly artifacts: Pick<ArtifactRepository, "save" | "update" | "listByUserId">,
    private readonly ownerUserId: () => string | undefined,
    private readonly specs: () => RouterArtifactSpec[] = jevRouterArtifacts,
  ) {}

  async sync(): Promise<void> {
    const owner = this.ownerUserId();
    if (!owner) return;
    try {
      const existing = new Map((await this.artifacts.listByUserId(owner, { types: ["router"] })).map((artifact) => [artifact.name, artifact]));
      for (const spec of this.specs()) {
        const current = existing.get(spec.name);
        if (!current) {
          await this.artifacts.save(Artifact.create({ userId: owner, type: "router", name: spec.name, data: { body: spec.body }, tags: ["router", ...spec.tags] }));
          continue;
        }
        const tags = ["router", ...spec.tags];
        const missingTags = tags.filter((tag) => !current.tags.includes(tag));
        if ((current.data as { body: string }).body === spec.body && missingTags.length === 0) continue;
        await this.artifacts.update(current.revise({ data: { body: spec.body }, tags: [...current.tags, ...missingTags] }), owner, current.revision);
      }
    } catch (error) {
      this.logger.error("falha ao sincronizar os artefatos dos JEVs", error instanceof Error ? error.stack : String(error));
    }
  }
}
