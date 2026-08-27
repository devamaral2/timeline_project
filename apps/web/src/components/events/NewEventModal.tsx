"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { EventType } from "@repo/entities/contracts";
import { cn } from "@/lib/utils";
import { legendTypes, typeIcons, typeLabels, typeStyles } from "./event-visuals";
import { RoutineForm } from "./new-event-forms/RoutineForm";
import { SleepForm } from "./new-event-forms/SleepForm";
import { TrainingForm } from "./new-event-forms/TrainingForm";
import { FoodForm } from "./new-event-forms/FoodForm";

interface NewEventModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function NewEventModal({ onClose, onCreated }: NewEventModalProps) {
  const [selectedType, setSelectedType] = useState<EventType | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4 py-8 backdrop-blur-sm duration-200 animate-in fade-in"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-event-title"
        className="flex max-h-[calc(100dvh-4rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card-hover duration-200 animate-in fade-in slide-in-from-bottom-2"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
          <h2 id="new-event-title" className="text-lg font-semibold tracking-tight text-foreground">
            {selectedType ? "Novo evento" : "Que tipo de evento?"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-6">
          {selectedType === null ? (
            <TypeSelector onSelect={setSelectedType} />
          ) : (
            <EventForm type={selectedType} onBack={() => setSelectedType(null)} onClose={onClose} onCreated={onCreated} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TypeSelector({ onSelect }: { onSelect: (type: EventType) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {legendTypes.map((type) => {
        const Icon = typeIcons[type];
        const styles = typeStyles[type];

        return (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            className="flex flex-col items-start gap-2.5 rounded-xl border border-border bg-background p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card"
          >
            <span className={cn("grid size-9 place-items-center rounded-lg", styles.iconBg)}>
              <Icon aria-hidden className={cn("size-5", styles.icon)} />
            </span>
            <span className="text-sm font-semibold text-foreground">{typeLabels[type]}</span>
          </button>
        );
      })}
    </div>
  );
}

interface EventFormRouterProps {
  type: EventType;
  onBack: () => void;
  onClose: () => void;
  onCreated: () => void;
}

function EventForm({ type, onBack, onClose, onCreated }: EventFormRouterProps) {
  switch (type) {
    case "routine":
      return <RoutineForm onBack={onBack} onClose={onClose} onCreated={onCreated} />;
    case "sleep":
      return <SleepForm onBack={onBack} onClose={onClose} onCreated={onCreated} />;
    case "training":
      return <TrainingForm onBack={onBack} onClose={onClose} onCreated={onCreated} />;
    case "food":
      return <FoodForm onBack={onBack} onClose={onClose} onCreated={onCreated} />;
  }
}
