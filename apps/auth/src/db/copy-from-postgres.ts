import type { AuthDatabase, AuthTransaction } from "./client";

/**
 * A copia unica dos dados do auth do Postgres para o SQLite, na virada (ADR 0025). Vai o que sustenta o acesso: quem
 * sao os usuarios e as senhas deles, os papeis e as permissoes, as chaves de dispositivo (o transcriber continua
 * emparelhado), as chaves de assinatura (os tokens ja emitidos continuam validos) e a auditoria. Sessoes, refresh
 * tokens, convites e contadores de tentativa ficam de fora: todo mundo faz login de novo, e um convite em aberto e
 * reemitido.
 *
 * Tudo numa transacao so: ou o SQLite fica com a copia inteira, ou continua como estava.
 */

type SourceRow = Record<string, unknown>;

/** O que a copia precisa do banco antigo: uma consulta. O `pg.Pool` serve. */
export interface CopySource {
  query(text: string): Promise<{ rows: SourceRow[] }>;
}

interface CopiedTable {
  table: string;
  columns: readonly string[];
  /** A ordem de leitura, estavel, para a conferencia comparar linha a linha se precisar. */
  orderBy: string;
  /** Como gravar quando a linha ja existe (os papeis do sistema nascem com a migration). */
  onConflict?: string;
}

// Na ordem das chaves estrangeiras.
export const COPIED_TABLES: readonly CopiedTable[] = [
  { table: "users", columns: ["id", "email", "name", "password_hash", "status", "created_at", "updated_at"], orderBy: "id" },
  {
    table: "roles",
    columns: ["key", "name", "description", "is_system", "created_at"],
    orderBy: "key",
    onConflict:
      "ON CONFLICT (key) DO UPDATE SET name = excluded.name, description = excluded.description, " +
      "is_system = excluded.is_system, created_at = excluded.created_at",
  },
  { table: "role_permissions", columns: ["role_key", "permission"], orderBy: "role_key, permission" },
  { table: "user_roles", columns: ["user_id", "role_key"], orderBy: "user_id, role_key" },
  { table: "user_permissions", columns: ["user_id", "permission", "effect"], orderBy: "user_id, permission" },
  {
    table: "device_keys",
    columns: ["id", "user_id", "label", "permission", "key_hash", "created_at", "last_used_at", "revoked_at"],
    orderBy: "id",
  },
  {
    table: "signing_keys",
    columns: ["kid", "status", "public_jwk", "encrypted_private_key", "created_at", "last_used_at", "retire_after", "retired_at"],
    orderBy: "kid",
  },
  {
    table: "audit_log",
    columns: [
      "id", "correlation_id", "actor_user_id", "action", "target_type", "target_id", "result", "reason", "metadata",
      "ip_address", "user_agent", "created_at",
    ],
    orderBy: "id",
  },
];

export class CopyRefusedError extends Error {}

export interface CopyReport {
  copied: Record<string, number>;
}

async function count(tx: AuthTransaction, table: string): Promise<number> {
  return Number((await tx.query<{ n: number }>(`SELECT count(*) AS n FROM ${table}`)).rows[0]?.n ?? 0);
}

export async function copyAuthDataFromPostgres(source: CopySource, target: AuthDatabase): Promise<CopyReport> {
  // Le tudo antes de abrir a transacao do SQLite: a escrita fica curta e nao espera a rede.
  const data = new Map<string, SourceRow[]>();
  for (const spec of COPIED_TABLES) {
    data.set(spec.table, (await source.query(`SELECT ${spec.columns.join(", ")} FROM ${spec.table} ORDER BY ${spec.orderBy}`)).rows);
  }

  return target.transaction(async (tx) => {
    if ((await count(tx, "users")) > 0) {
      throw new CopyRefusedError(
        "O SQLite do auth ja tem usuarios: a copia so entra num banco novo. Nada foi gravado.",
      );
    }
    // Os papeis do sistema vieram com a migration; as permissoes deles passam a ser as do banco antigo.
    await tx.query("DELETE FROM role_permissions");
    // O auth cria uma chave ao subir num banco vazio. Sem usuario nenhum, ela nunca assinou um token: sai, e as chaves
    // do banco antigo entram, para os tokens ja emitidos continuarem validos.
    await tx.query("DELETE FROM signing_keys");

    const copied: Record<string, number> = {};
    for (const spec of COPIED_TABLES) {
      const rows = data.get(spec.table) ?? [];
      const placeholders = spec.columns.map((_, index) => `$${index + 1}`).join(", ");
      const insert = `INSERT INTO ${spec.table} (${spec.columns.join(", ")}) VALUES (${placeholders}) ${spec.onConflict ?? ""}`;
      // O `pg` entrega Date, objeto (jsonb), lista (text[]) e texto (inet); o adaptador do SQLite grava cada um.
      for (const row of rows) await tx.query(insert, spec.columns.map((column) => row[column]));
      copied[spec.table] = rows.length;
    }

    // A conferencia: cada tabela tem no SQLite exatamente o que veio (os papeis podem ter os do sistema a mais).
    for (const spec of COPIED_TABLES) {
      const found = await count(tx, spec.table);
      const expected = copied[spec.table] ?? 0;
      if (spec.table === "roles" ? found < expected : found !== expected) {
        throw new Error(`Copia de ${spec.table}: ${expected} linha(s) no Postgres, ${found} no SQLite. Nada foi gravado.`);
      }
    }
    return { copied };
  });
}
