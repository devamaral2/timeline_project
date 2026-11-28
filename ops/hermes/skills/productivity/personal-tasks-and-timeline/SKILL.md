---
name: personal-tasks-and-timeline
description: "Braid MCP: user's tasks, artifacts, recurrences."
version: 2.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [tasks, todo, agenda, calendar, artifacts, notes, braid, mcp, personal]
    category: productivity
    related_skills: [news-briefing, email-inbox-triage, youtube-content]
    requires_toolsets: []
---

# Personal Tasks and Artifacts (Braid MCP)

The user's own tasks, artifacts and recurring series live in Braid, reached
through the tools of the `braid` MCP server. This is their real system of record:
prefer it over a scratch file or a new local tracker whenever they say "crie uma
tarefa", "marque na agenda", "anote", "salve um resumo".

## When to Use

- "Crie uma tarefa / um lembrete / um compromisso / uma nota" that belongs to the
  user's own list, not a file or a chat message.
- "O que tenho para hoje / o que está pendente" over their tasks or agenda.
- Editing, completing or cancelling a task they already have.
- Reading, creating or rewriting an artifact (note, news, e-mail summary,
  YouTube transcript).
- A recurring personal series ("todo dia às 7h").

Not this skill when they mean their Google Calendar (use `google-workspace`) or
a work tracker such as GitHub or Jira.

## Vocabulary

There are two things: **tasks** and **artifacts**.

- A task **without** `status` only marks a time in the agenda.
- A task **with** `status` is something to be done, tracked until it is finished.
- An artifact is a text or record the user reads: a note is an artifact.

"Evento" and "nota" in the user's speech map to these: an appointment is a task
without `status`; a note is an artifact of type `text`. There is no delete tool.

## Tool surface

| Need | Tool |
|---|---|
| Appointment in the agenda | `create_task` with `startedAt` / `estimatedFinishAt`, no `status` |
| Something to do | `create_task` with `status: "todo"` |
| Read / edit a task | `get_task` (`id`), `update_task` (`taskId`, `expectedRevision`) |
| Agenda in a time window | `list_agenda_tasks` (`from`, `to`, `actor`, `kind`, `tag`, `cursor`) |
| Open and tracked tasks | `list_tracked_tasks` (`status`, `priority`, `actor`, `tag`, `q`, `from`, `to`) |
| Venue or address | `search_places` first, then pass the returned `label` as `location` |
| Create / read artifacts | `create_artifact`, `get_artifact` (`id`), `list_artifacts` |
| Rewrite an artifact | `update_artifact` (`artifactId`, `expectedRevision`; `body` replaces the whole text) |
| Recurring series | `create_recurrence`, `get_recurrence` (`id`), `update_recurrence` (`recurrenceId`, `expectedRevision`), `list_recurrences` |

If these tools are not available in the session, say so and stop. Do not call the
MCP server over HTTP by hand: the allowlist in the configuration is the owner's
decision.

## Fields of a task

- `kind`: `common` (default), `meal`, `sleep`, `training`.
- `status`: `todo`, `toDefine` (no date yet), `doing`, `inHold`, `done`,
  `cancel`, `missed`. On update, `null` removes it.
- `priority`: `urgent`, `high`, `medium` (default), `low`.
- `longRunning`: stays out of the agenda, always has a status, never repeats.
- `description`, `location`, `tags`, `startedAt`, `estimatedFinishAt`,
  `finishedAt`.

## Artifacts

`create_artifact` takes `type`, `name`, `body` (markdown), `tags`, `taskIds` and
`idempotencyKey`. It creates only free-text types:

| `type` | What it is | Who says how to write it |
|---|---|---|
| `text` | A plain note (default) | free markdown |
| `news` | A round-up of news | skill `news-briefing` |
| `email_summary` | A summary of the inbox | skill `email-inbox-triage` |
| `youtube_transcript` | A video transcript | skill `youtube-content` |

For the last three the app draws the text as cards when it has headings, so
follow the format in the matching skill. Choose the type that says what the text
is; the type cannot be changed by `update_artifact`.

## Procedure

1. **Create with an explicit, stable idempotency key**, such as
   `tarefa:jogar-bola:2026-11-08`. Reuse it on a retry of the same item and use a
   new one only for a genuinely new item.
2. **Set the fields you were given, not defaults you invented.**
3. **Datetimes carry an offset**: `2026-11-09T21:00:00-03:00` for this user
   (America/Sao_Paulo).
4. **List before creating** when the request sounds cumulative ("mais um
   treino"): the same name may already be open.
5. **Read it back before reporting.** `create_task` returns `{"taskId": ...}` and
   `create_artifact` returns `{"artifactId": ...}`; confirm with `get_task` or
   `get_artifact` and report what you actually see.
6. **Report in one line**: name, status or artifact type, and the date when one
   was set. When a request to create something has no time, pick the smallest
   defensible window (starting now, about one hour), say which window you used and
   offer to change it: a task without a date does not show in the agenda.

## Pitfalls

- Claiming success from the create response alone.
- Editing without reading: every `update_*` needs the current `revision`.
- Reusing an idempotency key for a different item.
- Leaving duplicates behind: if an undated task with the same name exists,
  schedule that one or set it to `cancel`, and say which you did.
- Treating Braid as Google Calendar: they are separate stores.
