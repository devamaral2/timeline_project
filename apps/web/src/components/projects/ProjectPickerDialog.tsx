"use client";

import type { ProjectDto } from "@repo/contracts";
import { LoaderCircle, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EntityPickerDialog } from "@/components/edit/EntityPickerDialog";
// O mesmo rodapé de criação do modal de tarefas: um botão com o texto da busca.
import actions from "@/components/edit/task-create-actions.module.css";
import { ApiRequestError } from "@/lib/api/client-request";
import { createProject, listProjects } from "@/lib/api/projects";
import { plainText } from "@/lib/tasks/agenda-search";
import { ProjectLine } from "./project-line";

interface ProjectPickerDialogProps {
  /** O projeto escolhido na lista, ou o que a criação acabou de fazer. O modal fecha depois. */
  onPick: (project: ProjectDto) => void;
  onClose: () => void;
}

const SEARCH_FAILED = "Não foi possível buscar os projetos. Tente de novo.";
const NAME_TAKEN = "Já existe um projeto com esse nome. Escolha-o na lista ou use outro nome.";
const NAME_INVALID = "O nome do projeto tem de 1 a 60 caracteres.";
const CREATE_FAILED = "Não foi possível criar o projeto. Tente de novo.";

/** Os projetos do usuário (`diario` primeiro, os outros por nome) cujo nome tem o texto da busca. */
async function searchProjects(query: string): Promise<ProjectDto[]> {
  const projects = await listProjects();
  const needle = plainText(query);
  return needle ? projects.filter((project) => plainText(project.name).includes(needle)) : projects;
}

/**
 * A escolha do projeto da tarefa: o modal de seleção com a lista (`diario` primeiro e os outros por nome), a busca
 * pelo nome e, embaixo, a criação de um projeto novo com o texto digitado. Escolher ou criar devolve o projeto e
 * fecha; um nome repetido mostra a mensagem e deixa o modal aberto.
 */
export function ProjectPickerDialog({ onPick, onClose }: ProjectPickerDialogProps) {
  return (
    <EntityPickerDialog<ProjectDto>
      title="Projeto"
      searchLabel="Buscar projeto"
      search={searchProjects}
      keyOf={(project) => project.id}
      nameOf={(project) => project.name}
      renderItem={(project) => <ProjectLine project={project} />}
      onPick={onPick}
      onClose={onClose}
      failedMessage={SEARCH_FAILED}
      footer={(text, close) => <ProjectCreateAction text={text} onCreated={onPick} close={close} />}
    />
  );
}

type Phase = { kind: "idle" } | { kind: "creating" } | { kind: "failed"; message: string };

function failureMessage(cause: unknown): string {
  if (cause instanceof ApiRequestError && cause.kind === "conflict") return NAME_TAKEN;
  if (cause instanceof ApiRequestError && cause.kind === "invalid_input") return NAME_INVALID;
  return CREATE_FAILED;
}

/** O rodapé do modal: "Criar “texto”". O projeto nasce na hora, como a tarefa criada pelo modal de tarefas. */
function ProjectCreateAction({ text, onCreated, close }: { text: string; onCreated: (project: ProjectDto) => void; close: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const busy = phase.kind === "creating";
  const empty = text === "";

  async function create() {
    if (busy || empty) return;
    setPhase({ kind: "creating" });
    try {
      const project = await createProject(text);
      if (!alive.current) return;
      onCreated(project);
      close();
    } catch (cause) {
      if (alive.current) setPhase({ kind: "failed", message: failureMessage(cause) });
    }
  }

  return (
    <div className={actions.actions}>
      <button type="button" className={actions.action} disabled={busy || empty} onClick={() => void create()}>
        {busy ? <LoaderCircle className={`${actions.icon} ${actions.spin}`} aria-hidden /> : <Plus className={actions.icon} aria-hidden />}
        <span className={actions.label}>{empty ? "Criar projeto" : `Criar “${text}”`}</span>
      </button>
      {empty && !busy ? <p className={actions.hint}>Escreva na busca o nome do projeto novo.</p> : null}
      {phase.kind === "failed" ? <p role="alert" className={actions.hint} data-alert>{phase.message}</p> : null}
    </div>
  );
}
