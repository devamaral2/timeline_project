import { ulid } from "ulid";
import { EventValidationError } from "../errors/event.errors";
import { defaultEventItemRegistry, EventItemRegistry } from "../items/event-item-registry";

export interface EventItemProps {
  id?: string;
  position: number;
  type: string;
  schemaVersion: number;
  isPrimary: boolean;
  data: unknown;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

export class EventItem {
  readonly id: string;
  readonly position: number;
  readonly type: string;
  readonly schemaVersion: number;
  readonly isPrimary: boolean;
  readonly data: unknown;

  private constructor(props: Required<EventItemProps> & { id: string }) {
    this.id = props.id;
    this.position = props.position;
    this.type = props.type;
    this.schemaVersion = props.schemaVersion;
    this.isPrimary = props.isPrimary;
    this.data = props.data;
  }

  static create(props: EventItemProps, registry: EventItemRegistry = defaultEventItemRegistry): EventItem {
    if (!Number.isInteger(props.position) || props.position < 0 || props.position > 32767) {
      throw new EventValidationError("Event item position must be an integer between 0 and 32767");
    }

    const { schemaVersion, data } = registry.parse(props.type, props.data, props.schemaVersion);
    const frozenData = deepFreeze(structuredClone(data));

    return new EventItem({
      id: props.id ?? ulid(),
      position: props.position,
      type: props.type,
      schemaVersion,
      isPrimary: props.isPrimary,
      data: frozenData,
    });
  }
}
