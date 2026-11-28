import { BadRequestError } from "../common/http-errors";

/** Valor de query com lista separada por virgula ("todo,doing"); vazio vira `undefined`. */
export function parseEnumList<T extends string>(name: string, raw: string | undefined, allowed: readonly T[]): T[] | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const values = raw.split(",").map((value) => value.trim());
  for (const value of values) {
    if (!(allowed as readonly string[]).includes(value)) {
      throw new BadRequestError(`Invalid ${name}: "${value}". Allowed: ${allowed.join(", ")}`);
    }
  }
  return [...new Set(values)] as T[];
}

export function parseEnum<T extends string>(name: string, raw: string | undefined, allowed: readonly T[]): T | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new BadRequestError(`Invalid ${name}: "${raw}". Allowed: ${allowed.join(", ")}`);
  }
  return raw as T;
}

export function parseInstant(name: string, raw: string | undefined): Date | undefined {
  if (raw === undefined || raw === "") return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new BadRequestError(`Invalid ${name} date`);
  return date;
}

/** Texto de busca: sem espaco nas pontas, minusculo; vazio vira `undefined`. */
export function normalizeSearch(raw: string | undefined): string | undefined {
  const text = raw?.trim().toLowerCase();
  return text ? text : undefined;
}
