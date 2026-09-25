import type { Metadata } from "next";
import { EventDetailScreen } from "@/components/events/EventDetailScreen";
import type { EventDetailDto, TaskDetailDto } from "@/lib/api/contracts";
import styles from "../mockup.module.css";

export const metadata: Metadata = {
  title: "Detalhe do evento — Braid · Mockup",
  description: "Estudo visual da tela de detalhe do evento, com dados ilustrativos.",
  robots: { index: false, follow: false },
};

/*
 * O estudo visual da tela de detalhe.
 *
 * E a mesma `EventDetailScreen` da agenda de verdade, so que alimentada com
 * dados de exemplo e sem acoes — e por isso que ela serve de modelo: o que se
 * ajustar aqui ja esta ajustado la. As variacoes por tipo de evento nascem
 * nesta pagina antes de ir para a rota real.
 */
const exampleEvent: EventDetailDto = {
  id: "mockup-evento",
  name: "Reunião de planejamento",
  description:
    "Fechar o escopo da próxima entrega e revisar o que ficou pendente da semana passada.\n\nLevar a lista de decisões em aberto.",
  startedAt: "2026-04-15T10:00:00-03:00",
  finishedAt: "2026-04-15T11:00:00-03:00",
  tags: ["trabalho", "equipe"],
  missed: false,
  priority: "urgent",
  notifyOffsetsMinutes: [15],
  interruptions: [],
  revision: 1,
  primaryItemId: "mockup-item",
  items: [{ id: "mockup-item", position: 0, type: "routine", schemaVersion: 1, isPrimary: true, data: {} }],
  taskIds: ["mockup-tarefa-1", "mockup-tarefa-2"],
};

const exampleTasks: TaskDetailDto[] = [
  {
    id: "mockup-tarefa-1",
    name: "Revisar as decisões em aberto",
    description: "",
    status: "done",
    priority: "medium",
    notifyOffsetsMinutes: [],
    tags: [],
    dependsOnTaskIds: [],
    revision: 1,
  },
  {
    id: "mockup-tarefa-2",
    name: "Escrever a ata e enviar para a equipe",
    description: "",
    status: "todo",
    priority: "high",
    notifyOffsetsMinutes: [],
    tags: [],
    dependsOnTaskIds: [],
    revision: 1,
  },
];

export default function EventDetailMockup() {
  return (
    <main id="conteudo" className={styles.detailMain}>
      <EventDetailScreen event={exampleEvent} tasks={exampleTasks} backHref="/mockups/eventos" />
      <p className={styles.detailPrototypeNote}>Estudo visual · dados de exemplo</p>
    </main>
  );
}
