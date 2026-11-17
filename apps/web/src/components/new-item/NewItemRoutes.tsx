"use client";

import { useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import type { ArtifactDto } from "@repo/contracts";
import { ArtifactEditView } from "@/components/artifact-edit/ArtifactEditView";
import { BackButton, DetailFrame, DetailMessage, DetailNav } from "@/components/detail/detail-parts";
import { useMotionRouter } from "@/components/shell/navigation-motion";
import { getArtifact } from "@/lib/api/artifacts";

/**
 * A criação de artefato, na rota `/notas/nova`: o formulário da edição, vazio (nota de texto ou alimento).
 * `?nome=` põe o nome. Salvar abre o artefato criado; Descartar volta à lista.
 */
export function NewNoteRoute({ userId }: { userId: string }): ReactNode {
  const router = useMotionRouter();
  const initialName = useSearchParams().get("nome") ?? undefined;
  return (
    <ArtifactEditView
      initialName={initialName}
      onSaved={(artifactId) => router.replace(`/${userId}/notas/${artifactId}`)}
      onLeave={() => router.replace(`/${userId}/notas`)}
    />
  );
}

/**
 * A edição da nota de texto, na rota `/notas/:id/editar`: carrega o artefato e monta o formulário com ele.
 * Só a nota de texto própria se edita aqui; os outros tipos e o catálogo global ficam na leitura.
 */
export function EditNoteRoute({ userId, noteId }: { userId: string; noteId: string }): ReactNode {
  const router = useMotionRouter();
  const [note, setNote] = useState<ArtifactDto | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getArtifact(noteId).then(
      (loaded) => { if (!cancelled) setNote(loaded); },
      () => { if (!cancelled) setFailed(true); },
    );
    return () => { cancelled = true; };
  }, [noteId]);

  const back = () => router.replace(`/${userId}/notas/${noteId}`);

  function frame(children: ReactNode) {
    return (
      <DetailFrame
        leadLabel="Resumo do documento"
        bodyLabel="Conteúdo do documento"
        lead={<DetailNav label="Navegação do registro" back={<BackButton onClick={back}>Voltar</BackButton>} />}
      >
        {children}
      </DetailFrame>
    );
  }

  if (failed) return frame(<DetailMessage alert>Não foi possível carregar o documento. Tente novamente.</DetailMessage>);
  if (!note) return frame(<DetailMessage>Carregando documento…</DetailMessage>);
  if (note.type !== "text" || note.global) return frame(<DetailMessage alert>Este documento não se edita aqui.</DetailMessage>);

  return <ArtifactEditView existing={note} onSaved={back} onLeave={back} />;
}
