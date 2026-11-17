---
name: personal-tasks-and-timeline
description: "Braid MCP: user's tasks, events, notes, recurrences."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [tasks, todo, timeline, calendar, notes, braid, mcp, personal]
    category: productivity
    requires_toolsets: []
---

# Personal Tasks, Events and Notes (Braid MCP)

The user's own task list, timeline, notes and recurring series live in the Braid
MCP server (`tools.include` in `config.yaml` under `mcp_servers.braid`). This is
their real system of record — prefer it over a scratch file or a new local
tracker whenever they say "crie uma tarefa", "crie um evento", "anote".

## When to Use

- "Crie uma tarefa / um lembrete / uma nota" that belongs to the user's own
  list — not a file, not a chat message.
- "O que tenho para hoje / o que está pendente" over their tasks or timeline.
- Editing, completing or cancelling an item they already have.
- A recurring personal series ("todo dia às 7h").

Not this skill when they mean their Google Calendar (use `google-workspace`) or
a work tracker such as GitHub or Jira.

## Tool surface

**The server has no `create_task` / `create_note` tools** — a "tarefa" is an
*event with a status* (`status: "todo"`), and a note is an *artifact*. Check
the live tool list with `hermes mcp test braid` before trusting the table.

| Need | Tool |
|---|---|
| Create a task | `mcp__braid__create_event` with `status: "todo"` — requires `name` + `idempotencyKey` |
| Read a task | `mcp__braid__get_event` (returns `status`, `revision`) |
| List tasks | `mcp__braid__list_tracked_events` (events that carry a status) |
| Edit a task | `mcp__braid__update_event` (needs `expectedRevision`) |
| Create / read events | `mcp__braid__create_event`, `get_event`, `list_timeline_events` |
| Notes | `mcp__braid__create_artifact`, `get_artifact`, `list_artifacts`,
`update_artifact` |
| Recurring series | `mcp__braid__create_recurrence`, `get_recurrence`, `update_recurrence` |

Verify the catalog with `tool_search` before assuming a verb exists — there is
**no delete tool**. To retire a task set `status: "cancel"` (or `"done"`); for
events, update the fields you own rather than promising a removal.

## Procedure

1. **Create with an explicit, stable idempotency key.** `idempotencyKey` is
   required and is the safety net against duplicate items: `<kind>:<slug>:<date>`,
   e.g. `tarefa:jogar-bola:2026-11-08`. Re-calling with the same key and
   arguments returns the existing entity instead of a twin, so reuse it on
   retries and never randomise it per attempt.
2. **Set the fields you were given, not defaults you invented.** `status`
   (`todo`, `scheduled`, `toDefine`, `inHold`, `done`, `cancel`), `priority`
   (`urgent`, `high`, `medium`, `low`), `tags`, `description`,
   `startedAt`/`estimatedFinishAt`.
3. **Datetimes carry an offset.** `2026-11-09T21:00:00-03:00` for this user
   (America/Sao_Paulo). A bare local time is rejected or silently shifted.
4. **Read it back before reporting.** Call `list_tracked_events` (or `get_event` with
   the returned id) and quote the id you actually see. A created-looking tool
   response is not proof the item exists.
5. **Report in one line**: name, status, id. Add the date only when one was set,
   and ask for the missing half ("sem data — quer para hoje às 20h?") instead of
   silently scheduling it.

## Pitfalls

- **Claiming success from the create response alone.** The create call returns
  only an id; confirm via list/get, and if the list does not show it, say so.
- **Burning the idempotency key on a different item.** The key identifies the
  entity, not the attempt; a new key for a genuinely new item, the same key for
  a retry of the same one.
- **Assuming updates are free-form.** `update_*` works off `revision`; fetch the
  current object first or the write is based on a stale copy.
- **Duplicating an item the user already had.** List first when the request
  sounds cumulative ("mais uma tarefa de treino") — the same name may already be
  open, and a second row is noise the user has to clean up manually.
- **Confusing Braid events with Google Calendar.** They are different stores:
  an event created here does not appear in the user's Google Calendar. When the
  user says "agenda" meaning Google, follow `google-workspace` instead.
