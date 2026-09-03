import { DEFAULT_EVENT_PRIORITY, type EventPriority } from "../types/event-priority";
import { DEFAULT_EVENT_MISSED } from "../types/missed-flag";
import type { Interruption } from "../value-objects/interruption";
import { TagList } from "../value-objects/tag-list";
import { EventId } from "../value-objects/event-id";
import { EventValidationError } from "../errors/event.errors";
import { EventItem } from "./event-item.entity";
import { defaultEventItemRegistry, EventItemRegistry } from "../items/event-item-registry";

export interface EventCreateProps {
  id?: string;
  userId: string;
  name: string;
  description: string;
  startedAt: Date;
  finishedAt?: Date;
  tags: string[];
  interruptions: Interruption[];
  items: EventItem[];
  missed?: boolean;
  priority?: EventPriority;
}

export interface EventRehydrateProps extends EventCreateProps {
  revision: number;
}

export interface EventReviseChanges {
  name?: string;
  description?: string;
  startedAt?: Date;
  finishedAt?: Date;
  tags?: string[];
  interruptions?: Interruption[];
  items?: EventItem[];
  missed?: boolean;
  priority?: EventPriority;
}

interface EventBuildProps {
  id: string;
  userId: string;
  name: string;
  description: string;
  startedAt: Date;
  finishedAt: Date | undefined;
  tags: string[];
  interruptions: Interruption[];
  items: EventItem[];
  missed: boolean;
  priority: EventPriority;
  revision: number;
}

function isIncompatible(
  registry: EventItemRegistry,
  typeA: string,
  typeB: string,
): boolean {
  if (typeA === typeB) {
    const definition = registry.getDefinition(typeA);
    return definition ? definition.incompatibleWith.includes(typeA) : false;
  }
  const definitionA = registry.getDefinition(typeA);
  const definitionB = registry.getDefinition(typeB);
  return Boolean(
    definitionA?.incompatibleWith.includes(typeB) || definitionB?.incompatibleWith.includes(typeA),
  );
}

function validateItems(items: EventItem[], registry: EventItemRegistry): void {
  if (items.length === 0) {
    throw new EventValidationError("Event requires at least one item");
  }

  const ids = new Set<string>();
  const positions = new Set<number>();
  let primaryCount = 0;

  for (const item of items) {
    if (ids.has(item.id)) {
      throw new EventValidationError(`Duplicate event item id: ${item.id}`);
    }
    ids.add(item.id);

    if (positions.has(item.position)) {
      throw new EventValidationError(`Duplicate event item position: ${item.position}`);
    }
    positions.add(item.position);

    if (item.isPrimary) primaryCount += 1;
  }

  if (primaryCount !== 1) {
    throw new EventValidationError("Event requires exactly one primary item");
  }

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (isIncompatible(registry, items[i].type, items[j].type)) {
        throw new EventValidationError("Incompatible event items");
      }
    }
  }
}

export class Event {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly description: string;
  readonly startedAt: Date;
  readonly finishedAt: Date | undefined;
  readonly tags: string[];
  readonly interruptions: Interruption[];
  readonly items: EventItem[];
  readonly missed: boolean;
  readonly priority: EventPriority;
  readonly revision: number;
  readonly primaryItemId: string;

  private readonly registry: EventItemRegistry;

  private constructor(props: EventBuildProps, registry: EventItemRegistry) {
    this.id = props.id;
    this.userId = props.userId;
    this.name = props.name;
    this.description = props.description;
    this.startedAt = props.startedAt;
    this.finishedAt = props.finishedAt;
    this.tags = props.tags;
    this.interruptions = props.interruptions;
    this.items = props.items;
    this.missed = props.missed;
    this.priority = props.priority;
    this.revision = props.revision;
    this.registry = registry;

    const primaryItem = props.items.find((item) => item.isPrimary);
    if (!primaryItem) {
      throw new EventValidationError("Event requires exactly one primary item");
    }
    this.primaryItemId = primaryItem.id;
  }

  private static build(props: EventBuildProps, registry: EventItemRegistry): Event {
    if (props.finishedAt && props.finishedAt < props.startedAt) {
      throw new EventValidationError("finishedAt must be equal to or after startedAt");
    }
    if (!Number.isInteger(props.revision) || props.revision < 1) {
      throw new EventValidationError("Event revision must be an integer >= 1");
    }

    validateItems(props.items, registry);

    return new Event(
      {
        ...props,
        tags: TagList.create(props.tags),
        items: [...props.items].sort((a, b) => a.position - b.position),
      },
      registry,
    );
  }

  static create(props: EventCreateProps, registry: EventItemRegistry = defaultEventItemRegistry): Event {
    return Event.build(
      {
        id: props.id ?? EventId.create(),
        userId: props.userId,
        name: props.name,
        description: props.description,
        startedAt: props.startedAt,
        finishedAt: props.finishedAt,
        tags: props.tags,
        interruptions: props.interruptions,
        items: props.items,
        missed: props.missed ?? DEFAULT_EVENT_MISSED,
        priority: props.priority ?? DEFAULT_EVENT_PRIORITY,
        revision: 1,
      },
      registry,
    );
  }

  static rehydrate(
    props: EventRehydrateProps,
    registry: EventItemRegistry = defaultEventItemRegistry,
  ): Event {
    return Event.build(
      {
        id: props.id ?? EventId.create(),
        userId: props.userId,
        name: props.name,
        description: props.description,
        startedAt: props.startedAt,
        finishedAt: props.finishedAt,
        tags: props.tags,
        interruptions: props.interruptions,
        items: props.items,
        missed: props.missed ?? DEFAULT_EVENT_MISSED,
        priority: props.priority ?? DEFAULT_EVENT_PRIORITY,
        revision: props.revision,
      },
      registry,
    );
  }

  revise(changes: EventReviseChanges): Event {
    return Event.build(
      {
        id: this.id,
        userId: this.userId,
        name: changes.name ?? this.name,
        description: changes.description ?? this.description,
        startedAt: changes.startedAt ?? this.startedAt,
        finishedAt: changes.finishedAt !== undefined ? changes.finishedAt : this.finishedAt,
        tags: changes.tags ?? this.tags,
        interruptions: changes.interruptions ?? this.interruptions,
        items: changes.items ?? this.items,
        missed: changes.missed ?? this.missed,
        priority: changes.priority ?? this.priority,
        revision: this.revision + 1,
      },
      this.registry,
    );
  }

  getDurationMinutes(): number | null {
    if (!this.finishedAt) return null;
    return Math.round((this.finishedAt.getTime() - this.startedAt.getTime()) / 60000);
  }
}
