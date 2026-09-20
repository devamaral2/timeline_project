import { char, check, index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { agentChatRoleEnum } from "./enums";

/** Um registro que a resposta tocou (`AgentChatEntityRef` dos contratos). */
interface MessageEntitiesColumn {
  kind: "event" | "task" | "note";
  id: string;
  change: "created" | "updated" | "deleted";
  label?: string;
}

/**
 * Uma conversa com o agente. O historico deixou de ser do cliente: e daqui que
 * o servidor monta o que vai ao modelo, e e por isso que a conversa tem dono
 * proprio em vez de herdar o do socket.
 *
 * `revision` trava renomear e apagar, como no resto da casa. **Anexar mensagem
 * nao mexe em `revision`**: duas abas conversando na mesma thread sao um caso
 * legitimo, e nao um conflito — quem as serializa e o `FOR UPDATE` desta linha
 * no batch writer, que tambem e quem decide o `seq` seguinte.
 */
export const agentConversations = pgTable(
  "agent_conversations",
  {
    id: char("id", { length: 26 }).primaryKey(),
    revision: integer("revision").notNull().default(1),
    userId: text("user_id").notNull(),
    // Nulo ate alguem renomear: a lista cai no texto da primeira mensagem.
    title: text("title"),
    // Ordena a lista sem tocar em `agent_chat_messages`. Nasce igual a
    // `created_at`: uma conversa so e gravada junto da primeira mensagem, na
    // mesma transacao, entao nunca existe uma sem data de atividade.
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    // A lista de conversas do usuario, em cursor keyset — mesma forma de
    // `events_timeline_cursor_idx`.
    index("agent_conversations_user_recent_idx")
      .on(table.userId, table.lastMessageAt.desc(), table.id.desc())
      .where(sql`${table.deletedAt} IS NULL`),
    check("agent_conversations_revision_min", sql`${table.revision} >= 1`),
    check(
      "agent_conversations_title_not_blank",
      sql`${table.title} IS NULL OR btrim(${table.title}) <> ''`,
    ),
  ],
);

/**
 * As mensagens de uma conversa, na ordem em que aconteceram.
 *
 * Sem `user_id`: e tabela filha e herda o filtro do dono pelo join com a
 * conversa, como `event_items` faz com `events`. Sem `deleted_at`: mensagem
 * nao se apaga sozinha, some com a conversa — e como o soft delete da conversa
 * e um UPDATE, o `cascade` abaixo nao dispara e as linhas ficam. Quem as torna
 * inalcancaveis e a leitura, que sempre junta com a conversa filtrando
 * `deleted_at IS NULL`.
 */
export const agentChatMessages = pgTable(
  "agent_chat_messages",
  {
    id: char("id", { length: 26 }).primaryKey(),
    conversationId: char("conversation_id", { length: 26 })
      .notNull()
      .references(() => agentConversations.id, { onDelete: "cascade" }),
    // Ordem dentro da conversa, a partir de 1. Atribuido sob a trava da linha
    // da conversa: duas requisicoes simultaneas nao colidem nem deixam buraco.
    seq: integer("seq").notNull(),
    role: agentChatRoleEnum("role").notNull(),
    content: text("content").notNull(),
    entities: jsonb("entities").$type<MessageEntitiesColumn[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Cobre tambem "os ultimos N turnos desta conversa": o Postgres varre o
    // indice do unique para tras sem custo, entao nao ha indice DESC separado.
    unique("agent_chat_messages_seq_unique").on(table.conversationId, table.seq),
    check("agent_chat_messages_seq_min", sql`${table.seq} >= 1`),
    check("agent_chat_messages_content_not_blank", sql`btrim(${table.content}) <> ''`),
    check("agent_chat_messages_entities_array", sql`jsonb_typeof(${table.entities}) = 'array'`),
  ],
);
