/**
 * Listas do que a query do agente pode usar. Tudo fora delas e recusado — a
 * seguranca vem de negar o desconhecido, nao de listar o perigoso.
 */

/** Tipos de no do AST do libpg-query (PG17) aceitos em qualquer ponto da query. */
export const ALLOWED_NODE_TYPES: ReadonlySet<string> = new Set([
  "SelectStmt",
  "ResTarget",
  "ColumnRef",
  "A_Star",
  "A_Const",
  "A_Expr",
  "A_Indirection",
  "A_Indices",
  "A_ArrayExpr",
  "BoolExpr",
  "NullTest",
  "BooleanTest",
  "CaseExpr",
  "CaseWhen",
  "CoalesceExpr",
  "MinMaxExpr",
  "RowExpr",
  "SubLink",
  "RangeVar",
  "RangeSubselect",
  "JoinExpr",
  "CommonTableExpr",
  "FuncCall",
  "NamedArgExpr",
  "TypeCast",
  "SortBy",
  "WindowDef",
  "GroupingSet",
  "GroupingFunc",
  "SQLValueFunction",
  "List",
  "String",
  "Integer",
  "Float",
  "Boolean",
  "BitString",
]);

/** So as variantes de data e hora; CURRENT_USER e afins nao interessam ao agente. */
export const ALLOWED_SQL_VALUE_FUNCTIONS: ReadonlySet<string> = new Set([
  "SVFOP_CURRENT_DATE",
  "SVFOP_CURRENT_TIME",
  "SVFOP_CURRENT_TIME_N",
  "SVFOP_CURRENT_TIMESTAMP",
  "SVFOP_CURRENT_TIMESTAMP_N",
  "SVFOP_LOCALTIME",
  "SVFOP_LOCALTIME_N",
  "SVFOP_LOCALTIMESTAMP",
  "SVFOP_LOCALTIMESTAMP_N",
]);

/** Funcoes chamadas pelo nome, sem schema. Nenhuma escreve, dorme ou le fora das tabelas. */
export const ALLOWED_FUNCTIONS: ReadonlySet<string> = new Set([
  // agregacao
  "count", "sum", "avg", "min", "max", "bool_and", "bool_or", "every", "string_agg", "array_agg",
  "jsonb_agg", "json_agg", "jsonb_object_agg", "percentile_cont", "percentile_disc", "mode",
  "stddev", "stddev_pop", "stddev_samp", "variance", "var_pop", "var_samp",
  // janela
  "row_number", "rank", "dense_rank", "percent_rank", "cume_dist", "ntile", "lag", "lead",
  "first_value", "last_value", "nth_value",
  // data e hora
  "now", "date_trunc", "date_part", "date_bin", "age", "make_date", "make_time", "make_timestamp",
  "make_timestamptz", "make_interval", "to_char", "to_date", "to_timestamp", "justify_days",
  "justify_hours", "justify_interval", "isfinite", "timezone", "extract",
  // texto
  "lower", "upper", "initcap", "length", "char_length", "btrim", "ltrim", "rtrim", "substr",
  "substring", "left", "right", "replace", "split_part", "concat", "concat_ws", "strpos",
  "position", "regexp_replace", "regexp_match", "translate", "format", "to_number",
  // numeros
  "abs", "round", "ceil", "ceiling", "floor", "trunc", "mod", "power", "sqrt", "sign", "div",
  // jsonb e arrays
  "jsonb_array_length", "jsonb_array_elements", "jsonb_array_elements_text", "jsonb_extract_path",
  "jsonb_extract_path_text", "jsonb_typeof", "jsonb_object_keys", "jsonb_each", "jsonb_each_text",
  "jsonb_build_object", "jsonb_build_array", "to_jsonb", "array_length", "array_to_string",
  "cardinality", "unnest",
]);

/**
 * O parser reescreve parte da sintaxe SQL como chamada qualificada a
 * `pg_catalog` — `EXTRACT(...)` vira `pg_catalog.extract`, `AT TIME ZONE` vira
 * `pg_catalog.timezone`, `LIKE ... ESCAPE` vira `pg_catalog.like_escape`. Sem
 * aceitar estas, a query nao conseguiria nem usar EXTRACT.
 */
export const ALLOWED_PG_CATALOG_FUNCTIONS: ReadonlySet<string> = new Set([
  "extract",
  "timezone",
  "btrim",
  "ltrim",
  "rtrim",
  "substring",
  "position",
  "overlay",
  "like_escape",
  "similar_to_escape",
  "normalize",
  "is_normalized",
]);

/** Casts permitidos. O parser qualifica os tipos padrao com `pg_catalog` (`::int` → `pg_catalog.int4`). */
export const ALLOWED_TYPES: ReadonlySet<string> = new Set([
  "int2", "int4", "int8", "integer", "int", "smallint", "bigint", "numeric", "decimal", "float4",
  "float8", "real", "text", "varchar", "bpchar", "bool", "boolean", "date", "time", "timetz",
  "timestamp", "timestamptz", "interval", "json", "jsonb",
]);

export const MAX_AGENT_SQL_LENGTH = 4000;
