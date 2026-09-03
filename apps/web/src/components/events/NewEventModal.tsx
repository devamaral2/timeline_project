"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { KnownEventItemType } from "@repo/entities/contracts";
import { cn } from "@/lib/utils";
import { ICON_STROKE_WIDTH, creatableItemTypes, visualForItemType } from "./event-visuals";
import { RoutineForm } from "./new-event-forms/RoutineForm";
import { SleepForm } from "./new-event-forms/SleepForm";
import { TrainingForm } from "./new-event-forms/TrainingForm";
import { MealForm } from "./new-event-forms/MealForm";
import { iconButtonClass } from "@/components/ui/button-styles";
import {
  dialogHeaderClass,
  dialogOverlayClass,
  dialogPanelClass,
  dialogTitleClass,
} from "@/components/ui/dialog-styles";

interface NewEventModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function NewEventModal({ onClose, onCreated }: NewEventModalProps) {
  const [selectedType, setSelectedType] = useState<KnownEventItemType | null>(null);
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
      className={dialogOverlayClass}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-event-title"
        className={cn(dialogPanelClass, "max-w-md")}
      >
        <div className={dialogHeaderClass}>
          <h2 id="new-event-title" className={dialogTitleClass}>
            {selectedType ? "Novo evento" : "Que tipo de evento?"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className={iconButtonClass}
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

function TypeSelector({ onSelect }: { onSelect: (type: KnownEventItemType) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {creatableItemTypes.map((type) => {
        const { Icon, label, text } = visualForItemType(type);

        return (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            className="flex flex-col items-start gap-2.5 rounded-2xl border border-border bg-secondary/50 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-brand/45 hover:bg-secondary hover:shadow-card-hover"
          >
            <Icon
              aria-hidden
              strokeWidth={ICON_STROKE_WIDTH}
              className={cn("size-6", text)}
            />
            <span className="text-sm font-semibold text-foreground">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

interface EventFormRouterProps {
  type: KnownEventItemType;
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
    case "meal":
      return <MealForm onBack={onBack} onClose={onClose} onCreated={onCreated} />;
  }
}
