import type { ProjectDto } from "@repo/contracts";
import { projectInitials } from "@repo/theme";
import { projectMarkStyle } from "@/lib/projects/project-mark";
import styles from "./project-line.module.css";

/**
 * A marca do projeto: as iniciais sobre a cor dele. A cor vem do nome, pela regra de `@repo/theme` (a mesma das tags,
 * compartilhada com o Android); o `diario` é neutro. `labelled` serve para a marca sozinha, sem o nome ao lado:
 * ela passa a ter o nome do projeto como nome acessível.
 */
export function ProjectMark({ project, labelled = false }: { project: ProjectDto; labelled?: boolean }) {
  return (
    <span
      className={styles.mark}
      style={projectMarkStyle(project)}
      data-project-mark
      data-personal={project.personal ? "true" : "false"}
      {...(labelled ? { role: "img", "aria-label": project.name } : { "aria-hidden": true })}
    >
      {projectInitials(project.name)}
    </span>
  );
}

/** A marca e o nome do projeto, lado a lado: os detalhes da tarefa e do pedido. A linha das listas usa só a marca. */
export function ProjectLine({ project }: { project: ProjectDto }) {
  return (
    <span className={styles.line} data-project-line>
      <ProjectMark project={project} />
      <span className={styles.name}>{project.name}</span>
    </span>
  );
}
