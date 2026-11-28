/**
 * O que a query do agente pode usar. Tudo fora destas listas e recusado pelo
 * authorizer do SQLite — a seguranca vem de negar o desconhecido, nao de listar
 * o perigoso. O isolamento entre usuarios nao depende daqui: ele vem de a
 * consulta rodar numa copia que so tem as linhas do usuario.
 */

export const MAX_AGENT_SQL_LENGTH = 4000;

/**
 * Funcoes chamadas pelo nome (em minusculas). Ficam de fora tudo que le o
 * ambiente (`sqlite_version`, `sqlite_source_id`, `sqlite_compileoption_*`),
 * carrega codigo (`load_extension`), aloca sem limite (`zeroblob`, `randomblob`)
 * ou da resultado diferente a cada chamada (`random`). O operador de JSON
 * aparece para o authorizer como funcao `->` e `->>`.
 */
export const ALLOWED_FUNCTIONS: ReadonlySet<string> = new Set([
  // agregacao
  "count", "sum", "total", "avg", "min", "max", "group_concat", "string_agg",
  // janela
  "row_number", "rank", "dense_rank", "percent_rank", "cume_dist", "ntile", "lag", "lead",
  "first_value", "last_value", "nth_value",
  // data e hora
  "date", "time", "datetime", "julianday", "unixepoch", "strftime", "timediff",
  // texto
  "lower", "upper", "length", "octet_length", "substr", "substring", "trim", "ltrim", "rtrim", "replace",
  "instr", "printf", "format", "concat", "concat_ws", "unicode", "char", "like", "glob", "quote",
  // numeros e controle
  "abs", "round", "sign", "ceil", "ceiling", "floor", "trunc", "mod", "pow", "power", "sqrt", "exp", "ln",
  "log", "log2", "log10", "coalesce", "ifnull", "nullif", "iif", "typeof", "likely", "unlikely", "likelihood",
  // json
  "json", "json_array", "json_array_length", "json_extract", "json_object", "json_quote", "json_type",
  "json_valid", "json_group_array", "json_group_object", "json_remove", "json_replace", "json_insert",
  "json_set", "json_patch", "->", "->>",
]);

/** Funcoes que devolvem tabela (`FROM json_each(data)`): o authorizer as ve como leitura de uma tabela com esse nome. */
export const ALLOWED_TABLE_FUNCTIONS: ReadonlySet<string> = new Set(["json_each", "json_tree"]);

/** Tetos de recursos do banco descartavel. O volume real e pequeno: estes numeros so existem para a consulta nao explodir. */
export const SANDBOX_LIMITS = {
  /** Maior texto ou blob de uma celula, em bytes (`SQLITE_LIMIT_LENGTH`). */
  length: 1_000_000,
  exprDepth: 50,
  compoundSelect: 10,
  functionArg: 32,
  likePatternLength: 200,
  /** Memoria que o SQLite pode alocar no total (`hard_heap_limit`). */
  hardHeapBytes: 128 * 1024 * 1024,
  /** Heap do JS do processo do sandbox. */
  maxOldSpaceMb: 192,
} as const;
