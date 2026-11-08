import { BadRequestException } from "@nestjs/common";

/** Valor de query com lista separada por virgula ("todo,scheduled"); vazio vira `undefined`. */
export function parseEnumList<T extends string>(name: string, raw: string | undefined, allowed: readonly T[]): T[] | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const values = raw.split(",").map((value) => value.trim());
  for (const value of values) {
    if (!(allowed as readonly string[]).includes(value)) {
      throw new BadRequestException(`Invalid ${name}: "${value}". Allowed: ${allowed.join(", ")}`);
    }
  }
  return [...new Set(values)] as T[];
}

export function parseEnum<T extends string>(name: string, raw: string | undefined, allowed: readonly T[]): T | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new BadRequestException(`Invalid ${name}: "${raw}". Allowed: ${allowed.join(", ")}`);
  }
  return raw as T;
}

export function parseInstant(name: string, raw: string | undefined): Date | undefined {
  if (raw === undefined || raw === "") return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`Invalid ${name} date`);
  return date;
}

/** Texto de busca: sem espaco nas pontas, minusculo; vazio vira `undefined`. */
export function normalizeSearch(raw: string | undefined): string | undefined {
  const text = raw?.trim().toLowerCase();
  return text ? text : undefined;
}

export function hasTag(tags: readonly string[], wanted: string | undefined): boolean {
  if (wanted === undefined) return true;
  const target = wanted.trim().toLowerCase();
  return tags.some((tag) => tag.toLowerCase() === target);
}
