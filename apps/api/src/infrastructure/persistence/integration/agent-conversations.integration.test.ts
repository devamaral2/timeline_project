import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  AgentChatMessage,
  AgentConversation,
  AgentConversationNotFoundError,
  AgentConversationOwnershipError,
  AgentConversationRevisionConflictError,
  EntityBatchConflictError,
  Task,
} from "../../../domain";
import type { EntityBatch } from "../../../domain/ports";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";
import { PostgresEntityBatchWriter } from "../agent-batch/postgres-entity-batch-writer";
import { PostgresAgentConversationQuery } from "../agent-chat/queries/postgres-agent-conversation.query";
import { PostgresAgentConversationRepository } from "../agent-chat/repositories/postgres-agent-conversation.repository";
import { PostgresTaskRepository } from "../tasks/repositories/postgres-task.repository";

const RUN_INTEGRATION = process.env.RUN_POSTGRES_INTEGRATION === "1";

describe.runIf(RUN_INTEGRATION)("agent conversations", () => {
  let ctx: PostgresTestContext;
  let writer: PostgresEntityBatchWriter;
  let conversations: PostgresAgentConversationRepository;
  let query: PostgresAgentConversationQuery;
  let tasks: PostgresTaskRepository;

  beforeEach(async () => {
    if (!ctx) {
      ctx = await createPostgresTestContext();
      writer = new PostgresEntityBatchWriter(ctx.db);
      conversations = new PostgresAgentConversationRepository(ctx.db);
      query = new PostgresAgentConversationQuery(ctx.db);
      tasks = new PostgresTaskRepository(ctx.db);
    } else {
      await ctx.reset();
    }
  }, 30000);

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  function turn(conversationId: string, userText: string, assistantText: string): AgentChatMessage[] {
    return [
      AgentChatMessage.create({ conversationId, role: "user", content: userText }),
      AgentChatMessage.create({ conversationId, role: "assistant", content: assistantText }),
    ];
  }

  function batchOf(conversation: EntityBatch["conversation"], userId = "user-1"): EntityBatch {
    return { userId, events: [], tasks: [], notes: [], conversation };
  }

  /** Um turno que nasce com a conversa, como o primeiro do chat faz. */
  async function startedConversation(userId = "user-1"): Promise<AgentConversation> {
    const create = AgentConversation.create({ userId });
    await writer.commit(
      batchOf({ conversationId: create.id, create, messages: turn(create.id, "oi", "Olá!") }, userId),
    );
    return create;
  }

  test("a first turn creates the conversation and its two messages together", async () => {
    const conversation = await startedConversation();

    const page = await query.listMessages({
      conversationId: conversation.id,
      userId: "user-1",
      limit: 10,
    });

    expect(page.items.map((item) => [item.seq, item.role, item.content])).toEqual([
      [2, "assistant", "Olá!"],
      [1, "user", "oi"],
    ]);
    expect(await conversations.findById(conversation.id)).not.toBeNull();
  });

  test("a second turn continues the sequence without a gap", async () => {
    const conversation = await startedConversation();

    const result = await writer.commit(
      batchOf({ conversationId: conversation.id, messages: turn(conversation.id, "e agora?", "Pronto.") }),
    );

    expect(result.conversation).toEqual({ firstSeq: 3, lastSeq: 4 });
    const { rows } = await ctx.pool.query(
      "SELECT seq FROM agent_chat_messages WHERE conversation_id = $1 ORDER BY seq",
      [conversation.id],
    );
    expect(rows.map((row) => Number(row.seq))).toEqual([1, 2, 3, 4]);
  });

  test("two turns committed at the same time never collide on seq", async () => {
    const conversation = await startedConversation();

    await Promise.all([
      writer.commit(batchOf({ conversationId: conversation.id, messages: turn(conversation.id, "a", "A") })),
      writer.commit(batchOf({ conversationId: conversation.id, messages: turn(conversation.id, "b", "B") })),
    ]);

    const { rows } = await ctx.pool.query(
      "SELECT seq FROM agent_chat_messages WHERE conversation_id = $1 ORDER BY seq",
      [conversation.id],
    );
    expect(rows.map((row) => Number(row.seq))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("a turn that conflicts on an entity writes no message at all", async () => {
    const conversation = await startedConversation();
    const task = Task.create({ userId: "user-1", name: "Limpar", description: "", tags: [] });
    await tasks.save(task);

    const conflicting: EntityBatch = {
      userId: "user-1",
      events: [],
      // Revisao que ja passou: o lote inteiro tem de ser recusado.
      tasks: [{ op: "update", entity: task.revise({ name: "Outro" }), expectedRevision: task.revision + 1 }],
      notes: [],
      conversation: {
        conversationId: conversation.id,
        messages: turn(conversation.id, "renomeie", "Tarefa alterada."),
      },
    };

    await expect(writer.commit(conflicting)).rejects.toBeInstanceOf(EntityBatchConflictError);

    const { rows } = await ctx.pool.query(
      "SELECT count(*)::int AS total FROM agent_chat_messages WHERE conversation_id = $1",
      [conversation.id],
    );
    expect(rows[0].total).toBe(2); // so o turno inicial
  });

  test("a pure query turn writes the messages and nothing else", async () => {
    const conversation = await startedConversation();

    await writer.commit(
      batchOf({
        conversationId: conversation.id,
        messages: turn(conversation.id, "o que tenho hoje?", "Nada marcado."),
      }),
    );

    const page = await query.listMessages({ conversationId: conversation.id, userId: "user-1", limit: 10 });
    expect(page.items[0]).toMatchObject({ seq: 4, role: "assistant", content: "Nada marcado." });
  });

  test("a deleted conversation disappears from reads but keeps its rows", async () => {
    const conversation = await startedConversation();

    await conversations.delete(conversation.id, "user-1");

    expect(await conversations.findById(conversation.id)).toBeNull();
    expect(
      await query.loadHistoryWindow({ conversationId: conversation.id, userId: "user-1", turns: 20 }),
    ).toBeNull();
    expect((await query.listConversations({ userId: "user-1", limit: 10 })).items).toEqual([]);
    expect(
      (await query.listMessages({ conversationId: conversation.id, userId: "user-1", limit: 10 })).items,
    ).toEqual([]);

    const { rows } = await ctx.pool.query(
      "SELECT count(*)::int AS total FROM agent_chat_messages WHERE conversation_id = $1",
      [conversation.id],
    );
    expect(rows[0].total).toBe(2);
  });

  test("a turn on a deleted conversation is a batch conflict", async () => {
    const conversation = await startedConversation();
    await conversations.delete(conversation.id, "user-1");

    await expect(
      writer.commit(batchOf({ conversationId: conversation.id, messages: turn(conversation.id, "oi", "Olá!") })),
    ).rejects.toBeInstanceOf(EntityBatchConflictError);
  });

  test("another user's conversation is indistinguishable from one that never existed", async () => {
    const mine = await startedConversation("user-1");

    expect(
      await query.loadHistoryWindow({ conversationId: mine.id, userId: "user-2", turns: 20 }),
    ).toBeNull();
    expect(
      await query.loadHistoryWindow({
        conversationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        userId: "user-1",
        turns: 20,
      }),
    ).toBeNull();
    await expect(
      writer.commit(batchOf({ conversationId: mine.id, messages: turn(mine.id, "oi", "Olá!") }, "user-2")),
    ).rejects.toBeInstanceOf(EntityBatchConflictError);
  });

  test("the history window comes back oldest first, capped at the asked turns", async () => {
    const conversation = await startedConversation();
    await writer.commit(
      batchOf({ conversationId: conversation.id, messages: turn(conversation.id, "segundo", "Dois.") }),
    );

    const window = await query.loadHistoryWindow({
      conversationId: conversation.id,
      userId: "user-1",
      turns: 3,
    });

    expect(window?.map((item) => item.text)).toEqual(["Olá!", "segundo", "Dois."]);
  });

  test("renaming needs the current revision and the right owner", async () => {
    const conversation = await startedConversation();

    await conversations.rename(conversation.revise({ title: "Treino" }), "user-1", conversation.revision);
    expect((await conversations.findById(conversation.id))?.title).toBe("Treino");

    await expect(
      conversations.rename(conversation.revise({ title: "x" }), "user-1", conversation.revision),
    ).rejects.toBeInstanceOf(AgentConversationRevisionConflictError);
    await expect(
      conversations.rename(conversation.revise({ title: "x" }), "user-2", conversation.revision),
    ).rejects.toBeInstanceOf(AgentConversationOwnershipError);
    await expect(conversations.delete(conversation.id, "user-2")).rejects.toBeInstanceOf(
      AgentConversationOwnershipError,
    );
  });

  test("deleting the same conversation twice is not found the second time", async () => {
    const conversation = await startedConversation();
    await conversations.delete(conversation.id, "user-1");

    await expect(conversations.delete(conversation.id, "user-1")).rejects.toBeInstanceOf(
      AgentConversationNotFoundError,
    );
  });

  test("the conversation list is newest first and pages by cursor", async () => {
    const first = await startedConversation();
    const second = await startedConversation();

    const page = await query.listConversations({ userId: "user-1", limit: 1 });
    expect(page.items.map((item) => item.id)).toEqual([second.id]);
    expect(page.nextCursor).toBeDefined();

    const next = await query.listConversations({ userId: "user-1", limit: 1, cursor: page.nextCursor });
    expect(next.items.map((item) => item.id)).toEqual([first.id]);
    expect(next.nextCursor).toBeUndefined();
  });

  test("the list names an unnamed conversation by its first request", async () => {
    const create = AgentConversation.create({ userId: "user-1" });
    await writer.commit(
      batchOf({
        conversationId: create.id,
        create,
        messages: turn(create.id, "quanto dormi ontem?", "Sete horas."),
      }),
    );
    await writer.commit(
      batchOf({ conversationId: create.id, messages: turn(create.id, "e anteontem?", "Seis.") }),
    );

    const page = await query.listConversations({ userId: "user-1", limit: 10 });

    // O primeiro pedido, e nao o ultimo: e ele que diz do que a conversa trata.
    expect(page.items[0]).toMatchObject({ title: undefined, preview: "quanto dormi ontem?" });

    await conversations.rename(create.revise({ title: "Sono" }), "user-1", create.revision);
    expect((await query.listConversations({ userId: "user-1", limit: 10 })).items[0]).toMatchObject({
      title: "Sono",
      preview: "quanto dormi ontem?",
    });
  });

  test("the database rejects a blank message and a duplicated seq", async () => {
    const conversation = await startedConversation();

    await expect(
      ctx.pool.query(
        `INSERT INTO agent_chat_messages (id, conversation_id, seq, role, content)
         VALUES ('01ARZ3NDEKTSV4RRFFQ69G5FAV', $1, 9, 'user', '   ')`,
        [conversation.id],
      ),
    ).rejects.toThrow();

    await expect(
      ctx.pool.query(
        `INSERT INTO agent_chat_messages (id, conversation_id, seq, role, content)
         VALUES ('01ARZ3NDEKTSV4RRFFQ69G5FAV', $1, 1, 'user', 'duplicado')`,
        [conversation.id],
      ),
    ).rejects.toThrow();
  });
});
