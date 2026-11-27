import { ArtifactId } from "../value-objects/artifact-id";
import { ArtifactValidationError } from "../errors/artifact.errors";
import { TagList } from "../../tasks/value-objects/tag-list";
import {
  DEFAULT_ARTIFACT_TYPE,
  defaultArtifactTypeRegistry,
  isGlobalArtifactType,
  type ArtifactTypeRegistry,
} from "../types/artifact-type-registry";

export interface ArtifactCreateProps {
  id?: string;
  /** Ausente, o artefato e global: sem dono. So alimento e exercicio. */
  userId?: string;
  name?: string;
  /** Ausente vira texto livre (`text`). */
  type?: string;
  schemaVersion?: number;
  data: unknown;
  tags?: string[];
  /** Copia de outro artefato, feita para uma tarefa. */
  derived?: boolean;
}

export interface ArtifactRehydrateProps extends ArtifactCreateProps {
  name: string;
  type: string;
  schemaVersion: number;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ArtifactReviseChanges {
  name?: string;
  type?: string;
  schemaVersion?: number;
  data?: unknown;
  tags?: string[];
}

interface ArtifactBuildProps {
  id: string;
  userId: string | undefined;
  name: string;
  type: string;
  schemaVersion: number;
  data: unknown;
  tags: string[];
  derived: boolean;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

/** O que o servidor escreve no alimento e o usuario nao edita. */
const SERVER_OWNED_FOOD_KEYS = ["generation", "nutritionSource"] as const;

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

/**
 * Um objeto que guarda conteudo e nao e um fluxo: nao tem status, horario nem
 * executor. `type` + `schemaVersion` dizem que forma o `data` tem. Ele nao sabe
 * onde aparece: quem registra que ele foi criado, alterado ou usado e um
 * tarefa, e ele pode nao aparecer em nenhum.
 */
export class Artifact {
  readonly id: string;
  readonly userId: string | undefined;
  readonly name: string;
  readonly type: string;
  readonly schemaVersion: number;
  readonly data: unknown;
  readonly tags: string[];
  readonly derived: boolean;
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private readonly registry: ArtifactTypeRegistry;

  private constructor(props: ArtifactBuildProps, registry: ArtifactTypeRegistry) {
    this.id = props.id;
    this.userId = props.userId;
    this.name = props.name;
    this.type = props.type;
    this.schemaVersion = props.schemaVersion;
    this.data = props.data;
    this.tags = props.tags;
    this.derived = props.derived;
    this.revision = props.revision;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.registry = registry;
  }

  /** Sem dono: todos leem e ninguem edita pelo app. */
  get isGlobal(): boolean {
    return this.userId === undefined;
  }

  private static build(
    props: Omit<ArtifactBuildProps, "name"> & { name: string | undefined },
    registry: ArtifactTypeRegistry,
  ): Artifact {
    if (!Number.isInteger(props.revision) || props.revision < 1) {
      throw new ArtifactValidationError("Artifact revision must be an integer >= 1");
    }
    if (props.userId === undefined && !isGlobalArtifactType(props.type)) {
      throw new ArtifactValidationError("Only foods and workouts can be global artifacts");
    }
    const { schemaVersion, data } = registry.parse(props.type, props.data, props.schemaVersion);
    const name = props.name ?? deriveArtifactName(props.type, data);
    if (!name.trim()) throw new ArtifactValidationError("Artifact name cannot be empty");

    return new Artifact(
      {
        ...props,
        name,
        schemaVersion,
        data: deepFreeze(structuredClone(data)),
        tags: TagList.create(props.tags),
      },
      registry,
    );
  }

  static create(props: ArtifactCreateProps, registry: ArtifactTypeRegistry = defaultArtifactTypeRegistry): Artifact {
    const now = new Date();
    return Artifact.build(
      {
        id: props.id ?? ArtifactId.create(),
        userId: props.userId,
        name: props.name,
        type: props.type ?? DEFAULT_ARTIFACT_TYPE,
        schemaVersion: props.schemaVersion ?? 1,
        data: props.data,
        tags: props.tags ?? [],
        derived: props.derived ?? false,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      },
      registry,
    );
  }

  static rehydrate(
    props: ArtifactRehydrateProps,
    registry: ArtifactTypeRegistry = defaultArtifactTypeRegistry,
  ): Artifact {
    return Artifact.build(
      {
        id: props.id ?? ArtifactId.create(),
        userId: props.userId,
        name: props.name,
        type: props.type,
        schemaVersion: props.schemaVersion,
        data: props.data,
        tags: props.tags ?? [],
        derived: props.derived ?? false,
        revision: props.revision,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      },
      registry,
    );
  }

  /**
   * A copia que uma tarefa ganha de um alimento, com a quantidade comida. E um
   * artefato proprio da tarefa: editar o original depois nao muda o passado.
   */
  copyForTask(userId: string, quantity?: string): Artifact {
    if (this.type !== "food") throw new ArtifactValidationError("Only a food can be copied into a task");
    const { generation: _generation, ...data } = this.data as Record<string, unknown>;
    return Artifact.create(
      {
        userId,
        name: this.name,
        type: this.type,
        schemaVersion: this.schemaVersion,
        data: quantity?.trim() ? { ...data, quantity: quantity.trim() } : data,
        derived: true,
      },
      this.registry,
    );
  }

  /**
   * Trocar o `type` sem mandar `data` nao faz sentido: o dado antigo seria
   * validado contra uma forma que nao e a dele.
   */
  revise(changes: ArtifactReviseChanges): Artifact {
    if (this.isGlobal) throw new ArtifactValidationError("A global artifact cannot be edited");
    if (
      this.type === "food" &&
      (this.data as { generation?: { status: string } }).generation?.status === "pending"
    ) {
      throw new ArtifactValidationError("A food whose nutrients are being calculated cannot be manually edited");
    }
    const typeChanged = changes.type !== undefined && changes.type !== this.type;
    if (typeChanged && changes.data === undefined) {
      throw new ArtifactValidationError("Changing the artifact type requires new data");
    }
    let data = changes.data !== undefined ? changes.data : this.data;
    if ((changes.type ?? this.type) === "food" && changes.data !== undefined) {
      const previous = this.type === "food" ? (this.data as Record<string, unknown>) : {};
      const incoming = (changes.data ?? {}) as Record<string, unknown>;
      for (const key of SERVER_OWNED_FOOD_KEYS) {
        if (incoming[key] !== undefined && JSON.stringify(incoming[key]) !== JSON.stringify(previous[key])) {
          throw new ArtifactValidationError("Food generation metadata is server-owned");
        }
      }
      data = { ...incoming, generation: previous.generation, nutritionSource: previous.nutritionSource };
    }
    return this.rebuild({ ...changes, data, typeChanged });
  }

  /** O que o pedido de construcao escreve no alimento: o conteudo calculado e o estado da geracao. */
  withGeneratedData(data: unknown): Artifact {
    return this.rebuild({ data, typeChanged: false });
  }

  private rebuild(changes: ArtifactReviseChanges & { typeChanged: boolean }): Artifact {
    return Artifact.build(
      {
        id: this.id,
        userId: this.userId,
        name: changes.name ?? this.name,
        type: changes.type ?? this.type,
        schemaVersion: changes.schemaVersion ?? (changes.typeChanged ? 1 : this.schemaVersion),
        data: changes.data !== undefined ? changes.data : this.data,
        tags: changes.tags ?? this.tags,
        derived: this.derived,
        revision: this.revision + 1,
        createdAt: this.createdAt,
        updatedAt: new Date(),
      },
      this.registry,
    );
  }
}

/** O titulo que o artefato ganha quando ninguem deu um: o que o proprio tipo sugere. */
export function deriveArtifactName(type: string, data: unknown): string {
  const record = (data ?? {}) as Record<string, unknown>;
  switch (type) {
    case "text":
      return firstLine(typeof record.body === "string" ? record.body : "") || "Nota";
    case "news":
      return firstLine(typeof record.body === "string" ? record.body : "") || "Notícias";
    case "email_summary":
      return firstLine(typeof record.body === "string" ? record.body : "") || "Resumo de e-mail";
    case "youtube_transcript":
      return firstLine(typeof record.body === "string" ? record.body : "") || "Transcrição";
    case "food":
      return firstLine(typeof record.description === "string" ? record.description : "") || "Alimento";
    case "sleep":
      return "Sono";
    case "training":
      return "Treino";
    default:
      return "Artefato";
  }
}

function firstLine(text: string): string {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 100) ?? "";
}
