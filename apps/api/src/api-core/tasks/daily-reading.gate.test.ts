import { expect, test } from "vitest";
import { InMemoryTaskCardQuery } from "./testing/in-memory-task-card.query";
import { createTasksKit } from "./testing/in-memory-tasks-kit";
import { Task } from "../../domain";
import { composeReadingArticle } from "./daily-reading-article";
import { DailyReadingGate } from "./daily-reading.gate";

const actor = { userId: "auth-user-1" };
// 17/08/2026, 12:00 em Sao Paulo.
const now = new Date("2026-08-17T15:00:00.000Z");
const article = composeReadingArticle({ url: "https://jornal.example/a", title: "A", markdown: "Texto." });
if (!article) throw new Error("artigo de teste invalido");

function setup() {
  const kit = createTasksKit({ clock: () => now });
  const gate = new DailyReadingGate(
    new InMemoryTaskCardQuery(kit.database),
    kit.artifactRepository,
    kit.artifactBuilder,
    kit.createTask,
    kit.batchWriter,
    undefined,
    () => now,
  );
  return { ...kit, gate };
}

test("o artigo de outro dia cai na leitura daquele dia, que nasce às 18h dele", async () => {
  const { gate, taskRepository } = setup();

  const placed = await gate.place({ actor, article, day: "2026-08-14" });

  expect(placed.readingCreated).toBe(true);
  expect((await taskRepository.findById(placed.readingTaskId))?.startedAt).toEqual(new Date("2026-08-14T21:00:00.000Z"));
  // A leitura de hoje continua sem existir: o dia pedido nao e o de hoje.
  const today = await gate.place({ actor, article });
  expect(today.readingCreated).toBe(true);
  expect(today.readingTaskId).not.toBe(placed.readingTaskId);
});

test.each(["leitura nova", "leitura existente com o artefato", "leitura existente sem o artefato"] as const)(
  "o companheiro entra no mesmo lote e na mesma transação, com a %s",
  async (scenario) => {
    const { gate, batchWriter, database, taskRepository } = setup();
    if (scenario !== "leitura nova") {
      await gate.place({ actor, article: scenario === "leitura existente com o artefato" ? article : { ...article, sourceUrl: "https://outro.example/b", body: "Fonte: [x](https://outro.example/b)\n\nB\n" } });
    }
    const commits = batchWriter.commits.length;
    const companionTask = Task.create({ userId: actor.userId, actor: "agent", kind: "save_content", status: "done", name: "Guardou", now });
    const seen: unknown[] = [];

    const placed = await gate.place({
      actor,
      article,
      companion: (where) => {
        seen.push(where);
        return { tasks: [{ op: "create", entity: companionTask }], afterWrite: async () => void seen.push("afterWrite") };
      },
    });

    expect(batchWriter.commits).toHaveLength(commits + 1);
    expect(seen).toEqual([placed, "afterWrite"]);
    expect(await taskRepository.findById(companionTask.id)).not.toBeNull();
    expect(database.tasks.filter((task) => task.actor === "human")).toHaveLength(1);
  },
);

test("o resultado diz que relação cada gravação tem com o que nasceu e com o que foi atualizado", async () => {
  const { gate } = setup();

  const first = await gate.place({ actor, article });
  const again = await gate.place({ actor, article });
  const other = await gate.place({ actor, article: { ...article, sourceUrl: "https://outro.example/b", body: "Fonte: [x](https://outro.example/b)\n\nB\n" } });

  expect([first.artifactRelation(), first.readingRelation()]).toEqual(["creates", "generates"]);
  expect([again.artifactRelation(), again.readingRelation()]).toEqual(["updates", "updates"]);
  expect([other.artifactRelation(), other.readingRelation()]).toEqual(["creates", "updates"]);
});
