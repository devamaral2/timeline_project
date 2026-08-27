"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { NewEventModal } from "./NewEventModal";

export function NewEventButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-card transition-colors hover:bg-primary/90"
      >
        <Plus aria-hidden className="size-4" />
        Novo evento
      </button>

      {open ? (
        <NewEventModal onClose={() => setOpen(false)} onCreated={() => window.location.reload()} />
      ) : null}
    </>
  );
}
