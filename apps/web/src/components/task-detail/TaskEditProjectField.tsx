"use client";

import type { ProjectDto } from "@repo/contracts";
import { ChevronDown } from "lucide-react";
import { useId, useRef, useState } from "react";
import { EditRow, editStyles as edit } from "@/components/edit/edit-parts";
import { ProjectMark } from "@/components/projects/project-line";
import { ProjectPickerDialog } from "@/components/projects/ProjectPickerDialog";
import type { TaskDraft, TaskDraftField } from "./task-draft";

interface TaskEditProjectFieldProps {
  draft: TaskDraft;
  onChange: <K extends TaskDraftField>(field: K, value: TaskDraft[K]) => void;
}

/** O que o campo mostra enquanto ninguém escolheu: a tarefa nasce em `personal`. A marca só depende do nome. */
const DEFAULT_PROJECT: ProjectDto = { id: "", name: "personal", personal: true };

/**
 * A linha "Projeto" de Informações, na criação e na edição: a marca e o nome do projeto num campo que abre a
 * escolha (`ProjectPickerDialog`). Sem escolha, mostra `personal`, o padrão. A troca só mexe no rascunho: a
 * gravação fica para o Salvar, que manda `projectId` (e `null` para voltar a `personal`).
 */
export function TaskEditProjectField({ draft, onChange }: TaskEditProjectFieldProps) {
  const [picking, setPicking] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const project = draft.project ?? DEFAULT_PROJECT;

  return (
    <EditRow label="Projeto" htmlFor={id}>
      <div className={edit.rowControls}>
        <button
          ref={openerRef}
          id={id}
          type="button"
          className={edit.control}
          aria-haspopup="dialog"
          aria-expanded={picking}
          aria-label={`Projeto: ${project.name}. Trocar`}
          onClick={() => setPicking(true)}
        >
          <ProjectMark project={project} />
          <span className={edit.controlText}>{project.name}</span>
          <ChevronDown className={edit.icon} aria-hidden />
        </button>
      </div>
      {picking ? (
        <ProjectPickerDialog
          onPick={(picked) => onChange("project", picked)}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </EditRow>
  );
}
