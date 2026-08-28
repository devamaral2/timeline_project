"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { EventType } from "@repo/entities/contracts";
import { cn } from "@/lib/utils";
import { ICON_STROKE_WIDTH, legendTypes, typeIcons, typeLabels, typeStyles } from "./event-visuals";
import { RoutineForm } from "./new-event-forms/RoutineForm";
import { SleepForm } from "./new-event-forms/SleepForm";
import { TrainingForm } from "./new-event-forms/TrainingForm";
import { FoodForm } from "./new-event-forms/FoodForm";
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
            className="flex flex-col items-start gap-2.5 rounded-2xl border border-border bg-secondary/50 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-brand/45 hover:bg-secondary hover:shadow-card-hover"
          >
            <Icon
              aria-hidden
              strokeWidth={ICON_STROKE_WIDTH}
              className={cn("size-6", styles.text)}
            />
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
