"use client";

import { Bot, ChevronDown, FileCode, FileText, type LucideIcon, Plus } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import type { ArtifactDto, ArtifactType, HumanTaskKind, TaskArtifactDto, TaskDto } from "@repo/contracts";
import { DetailSection } from "@/components/detail/detail-parts";
import { ArtifactContent } from "@/components/notes/ArtifactContent";
import { ICON_STROKE_WIDTH } from "@/components/tasks/task-visuals";
import { BarbellIcon, CompassIcon, MoonStarIcon, MovementIcon, PlateIcon } from "@/components/ui/type-icons";
import { isDailyReading } from "@/lib/tasks/daily-reading";
import { mealCaloriesKcal } from "@/lib/tasks/task-read-model";
import { ArtifactPickerDialog, artifactSource } from "./TaskEditArtifactsSection";
import { TaskAddVideo } from "./TaskAddVideo";
import { TaskMealContent } from "./TaskMealContent";
import styles from "./task-artifacts.module.css";
import relations from "./task-relations.module.css";

interface TaskArtifactsSectionProps {
  userId: string;
  task: TaskDto;
  /**
   * Liga um artefato daqui mesmo, gravando na hora. Com ele, a seção aparece sempre, com a ação que abre o modal de
   * seleção do tipo da tarefa (alimentos na refeição, exercícios no treino, os seus artefatos nos outros).
   */
  onAddArtifact?: (artifact: ArtifactDto) => void;
  /** Uma troca está sendo gravada: a ação espera. */
  busy?: boolean;
  /**
   * Na Leitura diária, a seção ganha "Adicionar vídeo", que pede a transcrição de um vídeo do YouTube. Chamado quando
   * o pedido foi gravado, para a tela reler a tarefa (o artefato do vídeo já está nela).
   */
  onVideoRequested?: () => void;
}

const TYPE_ICONS: Record<ArtifactType, LucideIcon> = {
  text: FileText,
  food: PlateIcon,
  sleep: MoonStarIcon,
  training: BarbellIcon,
  workout: MovementIcon,
  skill: FileCode,
  agent: Bot,
  router: CompassIcon,
};

/**
 * Os tipos cujo conteúdo aparece inteiro dentro da tarefa, como as notas antigas: texto,
 * roteador, alimento, treino e sono. Skill e agente ficam só na linha (o arquivo do Hermes tem
 * leitura, backups e edição próprios, no detalhe do artefato), e o exercício do catálogo também.
 */
const INLINE_TYPES: ReadonlySet<ArtifactType> = new Set(["text", "router", "food", "training", "sleep"]);

/**
 * A seção Artefatos do detalhe: os artefatos da tarefa, na ordem em que vieram
 * (`task.artifacts`, sem outra chamada). Cada artefato é um cartão: no cabeçalho, o
 * ícone do tipo, o nome e, em mono, a posição, o código do tipo e a relação
 * (`1 · text · uses`); o que a tarefa criou (`creates`) não está na lista e vem sem
 * posição. “catálogo global” aparece só no artefato do catálogo. Dentro do cartão vem
 * o conteúdo, para os tipos de `INLINE_TYPES` (o alimento no desenho próprio da
 * tarefa, `TaskMealContent`; os demais com o `ArtifactContent` do detalhe): começa
 * aberto, e a seta no fim do cabeçalho recolhe e estende. Tocar no nome abre o
 * detalhe do artefato. Tarefa sem artefato não mostra a seção, a não ser que o detalhe ligue
 * artefatos (`onAddArtifact`): aí a seção fica, com a ação embaixo da lista.
 * Na refeição, o total de calorias são os alimentos ligados somados (cópias incluídas). Na Leitura diária, "Adicionar vídeo"
 * (`onVideoRequested`) pede a transcrição de um vídeo do YouTube.
 */
export function TaskArtifactsSection({ userId, task, onAddArtifact, busy = false, onVideoRequested }: TaskArtifactsSectionProps) {
  if (task.artifacts.length === 0 && !onAddArtifact) return null;
  const positions = artifactPositions(task.artifacts);

  return (
    <DetailSection title="Artefatos" labelId="task-artifacts" count={task.artifacts.length}>
      {task.artifacts.length > 0 ? (
        <ul className={styles.list}>
          {task.artifacts.map((link, index) => (
            <ArtifactRow key={link.artifact.id} link={link} position={positions[index] ?? null} userId={userId} />
          ))}
        </ul>
      ) : null}
      {onAddArtifact ? <AddArtifact task={task} busy={busy} onAdd={onAddArtifact} /> : null}
      {onVideoRequested && isDailyReading(task) ? <TaskAddVideo onRequested={onVideoRequested} /> : null}
      {task.kind === "meal" && task.artifacts.length > 0 ? (
        <p className={styles.total}>
          <span>Total de calorias</span>
          <strong>{`${Math.round(mealCaloriesKcal(task.artifacts))} kcal`}</strong>
        </p>
      ) : null}
    </DetailSection>
  );
}

/** A ação de ligar artefato no detalhe; o rótulo segue o tipo da tarefa ("Adicionar alimento à refeição"). */
function AddArtifact({ task, busy, onAdd }: { task: TaskDto; busy: boolean; onAdd: (artifact: ArtifactDto) => void }) {
  const [picking, setPicking] = useState(false);
  const kind = task.kind as HumanTaskKind;
  return (
    <>
      <button type="button" className={relations.addAction} disabled={busy} onClick={() => setPicking(true)}>
        <Plus className={relations.addIcon} aria-hidden />
        <span>{artifactSource(kind).addLabel}</span>
      </button>
      {picking ? (
        <ArtifactPickerDialog
          kind={kind}
          linkedIds={task.artifacts.map((link) => link.artifact.id)}
          onPick={onAdd}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </>
  );
}

/** 1, 2, … para os artefatos da lista; `null` para o que a tarefa criou. */
function artifactPositions(artifacts: readonly TaskArtifactDto[]): (number | null)[] {
  let next = 0;
  return artifacts.map((link) => (link.relation === "creates" ? null : ++next));
}

function ArtifactRow({ link, position, userId }: { link: TaskArtifactDto; position: number | null; userId: string }) {
  const { artifact } = link;
  const Icon = TYPE_ICONS[artifact.type];
  const hasContent = INLINE_TYPES.has(artifact.type);
  const [open, setOpen] = useState(true);
  const contentId = useId();
  return (
    <li className={styles.card} data-artifact-type={artifact.type} data-open={hasContent && open}>
      <div className={styles.head}>
        <Icon className={styles.icon} size={20} strokeWidth={ICON_STROKE_WIDTH} aria-hidden />
        <Link href={`/${userId}/notas/${artifact.id}`} className={styles.body}>
          <span className={styles.name}>{artifact.name}</span>
          <span className={styles.meta}>
            <span className={styles.codes}>
              {position !== null ? <span>{position}</span> : null}
              <span>{artifact.type}</span>
              <span>{link.relation}</span>
            </span>
            {artifact.global ? <span>catálogo global</span> : null}
          </span>
        </Link>
        {hasContent ? (
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-controls={contentId}
            aria-label={`${open ? "Recolher" : "Estender"} o conteúdo de ${artifact.name}`}
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronDown size={18} strokeWidth={ICON_STROKE_WIDTH} aria-hidden />
          </button>
        ) : null}
      </div>
      {hasContent ? (
        <div className={styles.content} id={contentId} hidden={!open}>
          {artifact.type === "food" ? <TaskMealContent data={artifact.data} /> : <div className={styles.pad}><ArtifactContent artifact={artifact} /></div>}
        </div>
      ) : null}
    </li>
  );
}
