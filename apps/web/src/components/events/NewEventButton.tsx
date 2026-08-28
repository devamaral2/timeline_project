"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { primaryButtonClass } from "@/components/ui/button-styles";
import { cn } from "@/lib/utils";
import { NewEventModal } from "./NewEventModal";

interface NewEventButtonProps {
  /** No cabecalho estreito, preserva o nome acessivel e mostra so o simbolo. */
  compactOnMobile?: boolean;
}

export function NewEventButton({ compactOnMobile = false }: NewEventButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          primaryButtonClass,
          compactOnMobile ? "w-10 px-0 sm:w-auto sm:px-4" : null,
        )}
      >
        <Plus aria-hidden className="size-4" />
        <span className={compactOnMobile ? "sr-only sm:not-sr-only" : undefined}>
          Novo evento
        </span>
      </button>

      {open ? (
        <NewEventModal onClose={() => setOpen(false)} onCreated={() => window.location.reload()} />
      ) : null}
    </>
  );
}
