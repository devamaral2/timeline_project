import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { taskFixture } from "@/test/fake-api/tasks";
import { TaskArtifactsSection } from "./TaskArtifactsSection";

vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: vi.fn(),
}));

const noop = () => undefined;

test("o detalhe da Leitura diária tem o botão 'Adicionar vídeo' na seção Documentos", () => {
  render(<TaskArtifactsSection userId="u1" task={taskFixture({ id: "t1", name: "Leitura diária" })} onAddArtifact={noop} onVideoRequested={noop} />);

  expect(screen.getByRole("region", { name: "Documentos" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Adicionar vídeo" })).toBeInTheDocument();
});

test("outra tarefa não tem o botão 'Adicionar vídeo'", () => {
  render(<TaskArtifactsSection userId="u1" task={taskFixture({ id: "t1", name: "Comprar pão" })} onAddArtifact={noop} onVideoRequested={noop} />);

  expect(screen.queryByRole("button", { name: "Adicionar vídeo" })).not.toBeInTheDocument();
});

test("sem a ação de reler a tarefa (leitura sem edição) o botão não aparece, nem na Leitura diária", () => {
  render(<TaskArtifactsSection userId="u1" task={taskFixture({ id: "t1", name: "Leitura diária" })} onAddArtifact={noop} />);

  expect(screen.queryByRole("button", { name: "Adicionar vídeo" })).not.toBeInTheDocument();
});
