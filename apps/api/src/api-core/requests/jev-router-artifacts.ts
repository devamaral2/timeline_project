import { Logger } from "../../common/logger";
import { Artifact } from "../../domain";
import type { ArtifactRepository } from "../../domain/ports";
import { dispatchConfig } from "./request-config";

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

/**
 * O artefato `router` do JEV de entrada, escrito a partir dos mesmos parametros que o servidor usa. E o unico JEV do
 * chat: as tres perguntas que escolhem o destino do pedido.
 */
export function jevRouterArtifacts(): RouterArtifactSpec[] {
  const questions = Object.entries(dispatchConfig.questions)
    .map(([key, question]) => `### \`${key}\`\n\n${question.instructions}\n\n${bullets(question.criteria)}`)
    .join("\n\n");
  return [
    {
      name: "JEV · Despacho",
      tags: ["jev", "despacho"],
      body: [
        "# JEV · Despacho",
        "Parâmetros de `jev/dispatch.json`. Uma chamada com três perguntas de sim ou não, respondidas em paralelo. Um único `yes` certo escolhe o destino: `query` vai ao agente de consulta ao banco, `write` ao agente de criação e atualização de entidades e `config` ao modo modelo. Sem nenhum `yes`, com um `yes` incerto ou com mais de um, o pedido vai ao Hermes.",
        commonParams(dispatchConfig),
        "## Perguntas",
        questions,
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
