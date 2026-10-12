import type { TaskDetailDto, TaskSummaryDto } from "@/lib/api/contracts";

export function summaryTask(overrides: Partial<TaskSummaryDto> = {}): TaskSummaryDto {
  return {
    id: "t1",
    name: "Pagar conta de luz",
    status: "todo",
    priority: "medium",
    notifyOffsetsMinutes: [],
    tags: [],
    dependsOnTaskIds: [],
    revision: 1,
    ...overrides,
  };
}

export function detailTask(overrides: Partial<TaskDetailDto> = {}): TaskDetailDto {
  return {
    id: "t1",
    name: "Preparar apresentação de sexta",
    description: "Slides com o resumo da proposta.",
    status: "todo",
    priority: "high",
    notifyOffsetsMinutes: [1440],
    tags: ["trabalho"],
    dependsOnTaskIds: [],
    noteIds: [],
    revision: 3,
    ...overrides,
  };
}
