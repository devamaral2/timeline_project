/**
 * Fixtures da recorrência no formulário de tarefa: a série validada pelo schema do contrato e as saídas das funções
 * puras do web (`task-recurrence-draft.ts`) que o Kotlin porta (`emptyRecurrenceDraft`, `recurrenceDraftFromRule`,
 * `validateNewRecurrence`, `validateSeriesEdit`, `scheduleAfterTask`, `buildCreateRecurrenceInput`, `planSeriesEdit`).
 * O Kotlin confere as suas versões contra elas, caso a caso.
 */
import {
  createRecurrenceInputSchema,
  recurrenceSchema,
  updateRecurrenceInputSchema,
} from "../../../packages/contracts/src/schemas";
import { AGENT_SKILLS_PROJECT, PERSONAL_PROJECT, TIMELINE_PROJECT } from "./project";
import { emptyTaskDraft, type TaskDraft } from "../../../apps/web/src/components/task-detail/task-draft";
import {
  buildCreateRecurrenceInput,
  emptyRecurrenceDraft,
  planSeriesEdit,
  recurrenceDraftFromRule,
  scheduleAfterTask,
  validateNewRecurrence,
  validateSeriesEdit,
  type RecurrenceDraft,
} from "../../../apps/web/src/components/task-detail/task-recurrence-draft";

const ZONE = "America/Sao_Paulo";

function series(input: Record<string, unknown> & { id: string }) {
  return recurrenceSchema.parse({
    interval: 1,
    timeOfDay: "10:30",
    timeZone: ZONE,
    startsOn: "2026-09-21",
    template: { kind: "common", name: "Treino", description: "", priority: "medium" },
    revision: 3,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-02T12:00:00.000Z",
    ...input,
  });
}

const weekly = series({ id: "rec-1", frequency: "weekly", byWeekday: 0b0101010, durationMinutes: 60 });
const weeklyEnded = series({ id: "rec-2", frequency: "weekly", interval: 2, byWeekday: 0b0000010, endsOn: "2026-12-31" });
const daily = series({ id: "rec-3", frequency: "daily", interval: 3 });
const monthly = series({ id: "rec-4", frequency: "monthly", byMonthDay: 5 });
const yearly = series({ id: "rec-5", frequency: "yearly", byMonthDay: 5, byMonth: 3 });
const reloaded = series({ id: "rec-1", frequency: "weekly", byWeekday: 0b0000100, durationMinutes: 60, revision: 4 });
const weeklyInProject = series({
  id: "rec-1", frequency: "weekly", byWeekday: 0b0101010, durationMinutes: 60,
  template: { kind: "common", name: "Treino", description: "", priority: "medium", tags: ["saúde"], projectId: TIMELINE_PROJECT.id },
});
const all = { weekly, weeklyEnded, daily, monthly, yearly, weeklyInProject };

const base: RecurrenceDraft = { frequency: "weekly", interval: 1, weekdays: 0b0000010, monthDay: 5, month: 3, endsOn: "" };

function form(changes: Partial<TaskDraft>): TaskDraft {
  return { ...emptyTaskDraft("Treino de força"), ...changes };
}

const emptyDrafts = ["2026-09-20", "2026-09-23", "2026-12-31", ""].map((startDate) => ({ startDate, draft: emptyRecurrenceDraft(startDate) }));

const fromRule = Object.entries(all).map(([name, value]) => ({ name, series: value, draft: recurrenceDraftFromRule(value) }));

const scheduled = form({ startDate: "2026-09-21", startTime: "10:30", endDate: "2026-09-21", endTime: "11:30" });
const newValidation = [
  { name: "valid weekly", draft: base, form: scheduled },
  { name: "no start date", draft: base, form: form({ startTime: "10:30" }) },
  { name: "no start time", draft: base, form: form({ startDate: "2026-09-21" }) },
  { name: "neither", draft: base, form: form({}) },
  { name: "interval zero", draft: { ...base, interval: 0 }, form: scheduled },
  { name: "interval negative", draft: { ...base, interval: -2 }, form: scheduled },
  { name: "weekly no day", draft: { ...base, weekdays: 0 }, form: scheduled },
  { name: "weekly over 127", draft: { ...base, weekdays: 128 }, form: scheduled },
  { name: "weekly all days", draft: { ...base, weekdays: 127 }, form: scheduled },
  { name: "daily ignores weekdays", draft: { ...base, frequency: "daily", weekdays: 0 }, form: scheduled },
  { name: "monthly day 0", draft: { ...base, frequency: "monthly", monthDay: 0 }, form: scheduled },
  { name: "monthly day 32", draft: { ...base, frequency: "monthly", monthDay: 32 }, form: scheduled },
  { name: "monthly day 31", draft: { ...base, frequency: "monthly", monthDay: 31 }, form: scheduled },
  { name: "yearly feb 29", draft: { ...base, frequency: "yearly", monthDay: 29, month: 2 }, form: scheduled },
  { name: "yearly feb 30", draft: { ...base, frequency: "yearly", monthDay: 30, month: 2 }, form: scheduled },
  { name: "yearly apr 31", draft: { ...base, frequency: "yearly", monthDay: 31, month: 4 }, form: scheduled },
  { name: "yearly dec 31", draft: { ...base, frequency: "yearly", monthDay: 31, month: 12 }, form: scheduled },
  { name: "end before start", draft: { ...base, endsOn: "2026-09-20" }, form: scheduled },
  { name: "end on start", draft: { ...base, endsOn: "2026-09-21" }, form: scheduled },
  { name: "end after start", draft: { ...base, endsOn: "2026-12-31" }, form: scheduled },
  { name: "several", draft: { ...base, interval: 0, weekdays: 0, endsOn: "2026-01-01" }, form: scheduled },
].map((item) => ({ ...item, errors: validateNewRecurrence(item.draft, item.form) }));

const editValidation = [
  { name: "unchanged", series: weekly, draft: recurrenceDraftFromRule(weekly) },
  { name: "cannot clear end", series: weeklyEnded, draft: { ...recurrenceDraftFromRule(weeklyEnded), endsOn: "" } },
  { name: "change end", series: weeklyEnded, draft: { ...recurrenceDraftFromRule(weeklyEnded), endsOn: "2027-03-01" } },
  { name: "end before series start", series: weekly, draft: { ...recurrenceDraftFromRule(weekly), endsOn: "2026-09-01" } },
  { name: "no day", series: weekly, draft: { ...recurrenceDraftFromRule(weekly), weekdays: 0 } },
  { name: "interval", series: weekly, draft: { ...recurrenceDraftFromRule(weekly), interval: 0 } },
].map((item) => ({ ...item, errors: validateSeriesEdit(item.series, item.draft) }));

const after = [
  { name: "start and end", form: scheduled },
  { name: "start only", form: form({ startDate: "2026-09-30", startTime: "10:30" }) },
  { name: "month end", form: form({ startDate: "2026-12-31", startTime: "08:00", endDate: "2026-12-31", endTime: "09:00" }) },
  { name: "no date", form: form({ startTime: "10:30" }) },
].map((item) => ({ ...item, shifted: scheduleAfterTask(item.form) }));

const createCases = [
  { name: "weekly with end and duration", draft: { ...base, weekdays: 0b0101010, endsOn: "2026-12-31" }, form: scheduled },
  {
    name: "weekly every two weeks with tags and reminders",
    draft: { ...base, interval: 2, weekdays: 0b1000001 },
    form: { ...scheduled, kind: "training" as const, priority: "high" as const, description: " Pernas ", tags: ["saúde", "casa"], reminders: [30, 1440] },
  },
  { name: "daily without end of block", draft: { ...base, frequency: "daily", interval: 1 }, form: form({ startDate: "2026-09-21", startTime: "07:00" }) },
  { name: "monthly", draft: { ...base, frequency: "monthly", monthDay: 5 }, form: scheduled },
  { name: "yearly", draft: { ...base, frequency: "yearly", monthDay: 5, month: 3 }, form: scheduled },
  { name: "end equal to start has no duration", draft: base, form: form({ startDate: "2026-09-21", startTime: "10:30", endDate: "2026-09-21", endTime: "10:30" }) },
  { name: "name with spaces", draft: base, form: { ...scheduled, name: "  Corrida  " } },
  { name: "project goes in the template", draft: base, form: { ...scheduled, project: AGENT_SKILLS_PROJECT } },
  { name: "personal project goes in the template with its id", draft: base, form: { ...scheduled, project: PERSONAL_PROJECT } },
  { name: "joining task starts next day", draft: base, form: scheduleAfterTask(scheduled) },
].map((item) => {
  const input = buildCreateRecurrenceInput(item.draft, item.form, ZONE);
  createRecurrenceInputSchema.parse(input);
  return { ...item, timeZone: ZONE, input };
});

const planDrafts = (value: ReturnType<typeof series>, changes: Partial<RecurrenceDraft>): RecurrenceDraft => ({ ...recurrenceDraftFromRule(value), ...changes });
const planCases: { name: string; series: ReturnType<typeof series>; draft: RecurrenceDraft; project?: typeof PERSONAL_PROJECT | typeof AGENT_SKILLS_PROJECT }[] = [
  { name: "unchanged weekly", series: weekly, draft: planDrafts(weekly, {}) },
  { name: "unchanged daily", series: daily, draft: planDrafts(daily, {}) },
  { name: "unchanged yearly", series: yearly, draft: planDrafts(yearly, {}) },
  { name: "weekdays", series: weekly, draft: planDrafts(weekly, { weekdays: 0b0111110 }) },
  { name: "interval", series: weekly, draft: planDrafts(weekly, { interval: 2 }) },
  { name: "end set", series: weekly, draft: planDrafts(weekly, { endsOn: "2026-12-31" }) },
  { name: "end moved", series: weeklyEnded, draft: planDrafts(weeklyEnded, { endsOn: "2027-03-01" }) },
  { name: "weekly to monthly", series: weekly, draft: planDrafts(weekly, { frequency: "monthly", monthDay: 12 }) },
  { name: "weekly to daily", series: weekly, draft: planDrafts(weekly, { frequency: "daily" }) },
  { name: "monthly to yearly", series: monthly, draft: planDrafts(monthly, { frequency: "yearly", month: 7 }) },
  { name: "monthly day", series: monthly, draft: planDrafts(monthly, { monthDay: 6 }) },
  { name: "yearly month", series: yearly, draft: planDrafts(yearly, { month: 4 }) },
  { name: "project back to personal", series: weeklyInProject, draft: planDrafts(weeklyInProject, {}), project: PERSONAL_PROJECT },
  { name: "project swapped and rule changed", series: weeklyInProject, draft: planDrafts(weeklyInProject, { interval: 2 }), project: AGENT_SKILLS_PROJECT },
].map((item) => {
  const patch = planSeriesEdit(item.series, item.draft, item.project);
  if (patch) updateRecurrenceInputSchema.parse({ recurrenceId: item.series.id, ...patch });
  return { ...item, patch };
});

export function recurrenceFixtures(): Record<string, unknown> {
  return {
    "recurrence-series": all,
    "recurrence-series-reloaded": reloaded,
    "recurrence-empty-drafts": emptyDrafts,
    "recurrence-draft-from-rule": fromRule,
    "recurrence-new-validation": newValidation,
    "recurrence-edit-validation": editValidation,
    "recurrence-schedule-after": after,
    "recurrence-create-cases": createCases,
    "recurrence-plan-cases": planCases,
    "recurrence-created": { recurrenceId: "rec-new" },
  };
}
