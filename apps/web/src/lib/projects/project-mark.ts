import type { CSSProperties } from "react";
import type { ProjectDto } from "@repo/contracts";
import { hueForTag } from "@repo/theme";

/**
 * O estilo da marca de um projeto: só o matiz, que vem do nome pela mesma função das tags (`hueForTag`, em
 * `@repo/theme`), para web e Android pintarem o mesmo nome da mesma cor. A luminosidade, o croma e a cor do texto
 * ficam no CSS, por token. O `personal` não tem cor: sem matiz, a marca neutra do CSS vale.
 */
export function projectMarkStyle(project: Pick<ProjectDto, "name" | "personal">): CSSProperties {
  if (project.personal) return {};
  return { "--project-hue": hueForTag(project.name) } as CSSProperties;
}
