"use client";

import type { PlaceSuggestionDto } from "@repo/contracts";
import { MapPin } from "lucide-react";
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { EditFieldSection, editStyles as edit } from "@/components/edit/edit-parts";
import { searchPlaces } from "@/lib/api/places";
import { mapsUrl } from "@/lib/tasks/maps-link";

interface TaskEditLocationSectionProps {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}

const MIN_QUERY_LENGTH = 3;
const SUGGESTION_LIMIT = 6;
const SUGGESTION_DELAY_MS = 300;

/**
 * "Local": um campo de texto com sugestões do serviço de mapas (via API). Escolher uma sugestão grava o endereço
 * completo; quem não a usa digita o local à mão. Uma falha na busca não aparece: o campo segue valendo como texto.
 * A posição da pessoa nunca é lida nem enviada: a tarefa só tem local quando alguém o informa aqui.
 * Com um local preenchido, "Abrir no Google Maps" confere o lugar antes de salvar.
 */
export function TaskEditLocationSection({ value, error, onChange }: TaskEditLocationSectionProps) {
  const listId = useId();
  const [found, setFound] = useState<PlaceSuggestionDto[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [open, setOpen] = useState(false);
  // Só busca o que a pessoa digitou: escolher uma sugestão muda o valor sem pedir outra busca.
  const [typed, setTyped] = useState("");
  const query = typed.trim();
  const shown = open && query.length >= MIN_QUERY_LENGTH ? found : [];

  useEffect(() => {
    if (query.length < MIN_QUERY_LENGTH) return;
    let stale = false;
    const timer = setTimeout(() => {
      searchPlaces(query, SUGGESTION_LIMIT)
        .then((places) => {
          if (stale) return;
          setFound(places);
          setHighlighted(0);
        })
        .catch(() => {
          if (!stale) setFound([]);
        });
    }, SUGGESTION_DELAY_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  function choose(place: PlaceSuggestionDto) {
    onChange(place.label);
    setTyped("");
    setFound([]);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && shown.length) {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % shown.length);
    } else if (event.key === "ArrowUp" && shown.length) {
      event.preventDefault();
      setHighlighted((current) => (current - 1 + shown.length) % shown.length);
    } else if (event.key === "Enter") {
      // Enter com sugestões abertas escolhe a destacada; sem elas, não envia o formulário por engano.
      event.preventDefault();
      if (shown[highlighted]) choose(shown[highlighted]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <EditFieldSection title="Local" labelId="task-edit-location">
      <span className={edit.field}>
        <MapPin className={edit.icon} aria-hidden />
        <input
          id="task-location"
          type="text"
          role="combobox"
          aria-labelledby="task-edit-location"
          aria-expanded={shown.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? "task-location-error" : undefined}
          placeholder="Procure um endereço ou lugar"
          autoComplete="off"
          maxLength={300}
          value={value}
          onChange={(change) => {
            onChange(change.target.value);
            setTyped(change.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        />
      </span>
      {shown.length ? (
        <ul id={listId} role="listbox" className={edit.placeList} aria-label="Sugestões de local">
          {shown.map((place, index) => (
            <li key={place.label} role="option" aria-selected={index === highlighted}>
              <button
                type="button"
                tabIndex={-1}
                className={edit.place}
                data-highlighted={index === highlighted || undefined}
                // Sem isto o clique tira o foco do campo antes da escolha.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(place)}
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p id="task-location-error" className={edit.error}>{error}</p> : null}
      {value.trim() ? (
        <a className={edit.textAction} href={mapsUrl(value)} target="_blank" rel="noopener noreferrer">
          Abrir no Google Maps
        </a>
      ) : null}
    </EditFieldSection>
  );
}
