import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type StatementSync } from "./node-sqlite";
import type { RowDecoder } from "./columns";
import type { SqlFragment } from "./sql";

/**
 * O banco da API num arquivo SQLite (ADR 0024), no desenho que o t3code, o hermes-agent e o ai-memory repetem
 * (docs/research/sqlite-aprendizados.md):
 *
 * - **um escritor**: uma conexao so grava, e uma fila de uma vaga garante que so uma transacao esta aberta nela.
 *   O `node:sqlite` e sincrono, mas a transacao e assincrona (o callback espera outras promessas); sem a fila, a
 *   instrucao de outro request cairia no meio da transacao aberta;
 * - **leitores somente leitura**: o que se le fora de uma transacao vai por outra conexao, aberta `readOnly`. Com
 *   WAL, ela le o ultimo commit sem esperar o escritor, como uma conexao do pool lia no Postgres;
 * - **`BEGIN IMMEDIATE`** em toda transacao: ela pega o lock de escrita ja no inicio, e nao falha com
 *   `SQLITE_BUSY_SNAPSHOT` quando passa de leitura a escrita.
 */

export type Row = Record<string, unknown>;

export interface QueryResult<T> {
  rows: T[];
  /** Linhas devolvidas, ou, numa instrucao sem `RETURNING`, linhas alteradas. */
  rowCount: number;
}

/** Quem executa SQL: o banco (fora de transacao) ou uma transacao aberta. */
export interface SqlExecutor {
  /** Leitura. Fora de transacao, vai pela conexao somente leitura. */
  all<T = Row>(query: SqlFragment, decoder?: RowDecoder<T>): Promise<T[]>;
  get<T = Row>(query: SqlFragment, decoder?: RowDecoder<T>): Promise<T | undefined>;
  /** Escrita (ou leitura que precisa do escritor). Fora de transacao, espera a vez na fila de escrita. */
  execute<T = Row>(query: SqlFragment, decoder?: RowDecoder<T>): Promise<QueryResult<T>>;
}

/** A transacao que os agregados compartilham: tudo o que um caso de uso grava entra numa so. */
export interface Tx extends SqlExecutor {
  readonly inTransaction: true;
}

export interface Db extends SqlExecutor {
  transaction<T>(run: (tx: Tx) => Promise<T> | T): Promise<T>;
}

export class NestedTransactionError extends Error {
  constructor(operation: string) {
    super(
      `${operation} on the database while a transaction is open in this call: pass the open transaction instead ` +
        "(the single writer would wait for itself)",
    );
    this.name = "NestedTransactionError";
  }
}

const WAL_SIZE_LIMIT_BYTES = 64 * 1024 * 1024;
const BUSY_TIMEOUT_MS = 5000;
const STATEMENT_CACHE_LIMIT = 256;

/** A fila de uma vaga do escritor. */
class Mutex {
  private tail: Promise<void> = Promise.resolve();

  acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = this.tail.then(() => release);
    this.tail = this.tail.then(() => next);
    return ready;
  }
}

/** Uma conexao com o cache das instrucoes preparadas. */
class Connection {
  private readonly statements = new Map<string, StatementSync>();

  constructor(readonly handle: DatabaseSync) {}

  private prepare(text: string): StatementSync {
    let statement = this.statements.get(text);
    if (statement) {
      // O Map guarda a ordem de insercao: reinserir deixa as mais usadas no fim.
      this.statements.delete(text);
    } else {
      statement = this.handle.prepare(text);
      if (this.statements.size >= STATEMENT_CACHE_LIMIT) {
        const oldest = this.statements.keys().next().value;
        if (oldest !== undefined) this.statements.delete(oldest);
      }
    }
    this.statements.set(text, statement);
    return statement;
  }

  query<T>(query: SqlFragment, decoder?: RowDecoder<T>): QueryResult<T> {
    const statement = this.prepare(query.text);
    if (statement.columns().length === 0) {
      const { changes } = statement.run(...query.params);
      return { rows: [], rowCount: Number(changes) };
    }
    const raw = statement.all(...query.params) as Row[];
    const rows = decoder ? raw.map((row) => decoder.decode(row)) : (raw as T[]);
    return { rows, rowCount: rows.length };
  }

  close(): void {
    this.statements.clear();
    if (this.handle.isOpen) this.handle.close();
  }
}

class Transaction implements Tx {
  readonly inTransaction = true as const;
  active = true;

  constructor(private readonly connection: Connection) {}

  private check(): Connection {
    if (!this.active) throw new Error("Transaction already finished");
    return this.connection;
  }

  async all<T = Row>(query: SqlFragment, decoder?: RowDecoder<T>): Promise<T[]> {
    return this.check().query(query, decoder).rows;
  }

  async get<T = Row>(query: SqlFragment, decoder?: RowDecoder<T>): Promise<T | undefined> {
    return this.check().query(query, decoder).rows[0];
  }

  async execute<T = Row>(query: SqlFragment, decoder?: RowDecoder<T>): Promise<QueryResult<T>> {
    return this.check().query(query, decoder);
  }
}

export interface OpenOptions {
  /** So a conexao de escrita: o banco em memoria dos testes de unidade, que um segundo handle nao enxerga. */
  memory?: boolean;
}

function configure(handle: DatabaseSync, writer: boolean): void {
  handle.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  handle.exec("PRAGMA foreign_keys = ON");
  handle.exec("PRAGMA temp_store = MEMORY");
  if (!writer) return;
  handle.exec("PRAGMA journal_mode = WAL");
  // Com NORMAL o fsync fica para o checkpoint: um crash do processo nao perde nada; uma queda do sistema pode
  // desfazer os ultimos commits, sem corromper o banco.
  handle.exec("PRAGMA synchronous = NORMAL");
  // Sem limite, o `-wal` fica do tamanho da maior transacao que ja houve.
  handle.exec(`PRAGMA journal_size_limit = ${WAL_SIZE_LIMIT_BYTES}`);
}

export class SqliteDatabase implements Db {
  /** O Nest fecha o banco no desligamento (`enableShutdownHooks`). */
  onApplicationShutdown(): void {
    this.close();
  }

  private readonly lock = new Mutex();
  private readonly current = new AsyncLocalStorage<Transaction>();
  private readonly writer: Connection;
  private readonly reader: Connection;

  private constructor(readonly path: string, writer: DatabaseSync, reader: DatabaseSync | undefined) {
    this.writer = new Connection(writer);
    this.reader = reader ? new Connection(reader) : this.writer;
  }

  /** Abre (e cria, se preciso) o arquivo. As migrations ficam com `migrateDatabase`, que roda antes. */
  static open(path: string, options: OpenOptions = {}): SqliteDatabase {
    if (options.memory) {
      const handle = new DatabaseSync(":memory:");
      configure(handle, true);
      return new SqliteDatabase(":memory:", handle, undefined);
    }
    mkdirSync(dirname(path), { recursive: true });
    const writer = new DatabaseSync(path);
    configure(writer, true);
    const mode = String((writer.prepare("PRAGMA journal_mode").get() as Row).journal_mode).toLowerCase();
    // Sem WAL, o lock de leitura do leitor bloquearia os commits do escritor.
    if (mode !== "wal") throw new Error(`SQLite at ${path} is not in WAL mode (got ${mode})`);
    const reader = new DatabaseSync(path, { readOnly: true });
    configure(reader, false);
    return new SqliteDatabase(path, writer, reader);
  }

  /** A conexao de escrita crua, para o migrador e os testes. Fora disso, use `execute` e `transaction`. */
  get handle(): DatabaseSync {
    return this.writer.handle;
  }

  private outside(operation: string): void {
    if (this.current.getStore()?.active) throw new NestedTransactionError(operation);
  }

  async all<T = Row>(query: SqlFragment, decoder?: RowDecoder<T>): Promise<T[]> {
    return this.reader.query(query, decoder).rows;
  }

  async get<T = Row>(query: SqlFragment, decoder?: RowDecoder<T>): Promise<T | undefined> {
    return this.reader.query(query, decoder).rows[0];
  }

  async execute<T = Row>(query: SqlFragment, decoder?: RowDecoder<T>): Promise<QueryResult<T>> {
    this.outside("execute");
    const release = await this.lock.acquire();
    try {
      return this.writer.query(query, decoder);
    } finally {
      release();
    }
  }

  async transaction<T>(run: (tx: Tx) => Promise<T> | T): Promise<T> {
    this.outside("transaction");
    const release = await this.lock.acquire();
    const tx = new Transaction(this.writer);
    try {
      this.writer.handle.exec("BEGIN IMMEDIATE");
      try {
        const result = await this.current.run(tx, () => run(tx));
        this.writer.handle.exec("COMMIT");
        return result;
      } catch (error) {
        if (this.writer.handle.isTransaction) this.writer.handle.exec("ROLLBACK");
        throw error;
      }
    } finally {
      tx.active = false;
      release();
    }
  }

  /** Uma copia consistente do banco, com ele no ar (`VACUUM INTO`). Nunca copie o arquivo e o `-wal` soltos. */
  async backupTo(target: string): Promise<void> {
    this.outside("backup");
    const release = await this.lock.acquire();
    try {
      mkdirSync(dirname(target), { recursive: true });
      this.writer.handle.prepare("VACUUM INTO ?").run(target);
    } finally {
      release();
    }
  }

  close(): void {
    if (!this.writer.handle.isOpen) return;
    if (this.reader !== this.writer) this.reader.close();
    if (this.writer.handle.isOpen) {
      try {
        this.writer.handle.exec("PRAGMA optimize");
      } catch {
        // Fechar nao depende das estatisticas.
      }
    }
    this.writer.close();
  }
}
