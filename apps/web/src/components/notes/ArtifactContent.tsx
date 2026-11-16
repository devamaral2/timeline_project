import type { ArtifactDto } from "@repo/contracts";
import { DetailFact, DetailFacts } from "@/components/detail/detail-parts";
import { sleepAgendaOfArtifact } from "@/lib/artifacts/artifact-model";
import { noteMarkdownOf } from "@/lib/notes/notes-model";
import { AgentFileNoteView } from "./AgentFileNoteView";
import { MealNote, SleepNote, TextBody, TrainingNote } from "./NoteBody";
import styles from "./notes.module.css";

const workoutCategoryLabels = { cardio: "Cardio", strength: "Força", free: "Livre" } as const;

/**
 * O conteúdo do artefato aberto, conforme o tipo. Texto e roteador: o markdown, sem o título repetido na
 * primeira linha. Alimento, treino e sono: os mesmos desenhos do cartão de tarefa. Skill e agente: o arquivo
 * para o qual apontam. Exercício do catálogo: a categoria e a situação.
 */
export function ArtifactContent({ artifact }: { artifact: ArtifactDto }) {
  switch (artifact.type) {
    case "text":
    case "router": {
      const body = noteMarkdownOf(artifact);
      if (body === "") return null;
      return <article className={styles.noteCard} aria-label="Conteúdo da nota"><TextBody body={body} /></article>;
    }
    case "food":
      return <article className={styles.noteCard} aria-label="Conteúdo da nota"><MealNote data={artifact.data} /></article>;
    case "training":
      return <article className={styles.noteCard} aria-label="Conteúdo da nota"><TrainingNote data={artifact.data} /></article>;
    case "sleep": {
      const sleep = sleepAgendaOfArtifact(artifact.tasks ?? []);
      return (
        <article className={styles.noteCard} aria-label="Conteúdo da nota">
          {sleep ? <h2 className={styles.noteTitle}>{sleep.title}</h2> : null}
          <SleepNote data={artifact.data} agendaMinutes={sleep?.agendaMinutes ?? null} />
        </article>
      );
    }
    case "skill":
    case "agent":
      return <AgentFileNoteView data={artifact.data} />;
    case "workout":
      return (
        <DetailFacts label="Exercício do catálogo">
          <DetailFact label="Categoria">{workoutCategoryLabels[artifact.data.category]}</DetailFact>
          <DetailFact label="Situação">{artifact.data.active ? "Ativo" : "Inativo"}</DetailFact>
        </DetailFacts>
      );
  }
}
