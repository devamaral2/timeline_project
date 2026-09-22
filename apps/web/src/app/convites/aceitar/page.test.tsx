import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AcceptInvitePage from "./page";

const fetchMock = vi.fn();

beforeEach(() => {
  window.history.replaceState(null, "", "/convites/aceitar#token=invite-token");
  fetchMock.mockReset();
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
    name: "Amara",
    email: "a***@example.com",
    expiresAt: "2026-09-06T12:00:00.000Z",
  }), { status: 201, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

it("updates the password checklist while the user types", async () => {
  render(<AcceptInvitePage />);
  const password = await screen.findByLabelText("Senha");

  expect(screen.getByLabelText("1 número: pendente")).toBeInTheDocument();
  fireEvent.change(password, { target: { value: "senha1!" } });

  expect(screen.getByLabelText("1 número: atendido")).toBeInTheDocument();
  expect(screen.getByLabelText("1 caractere especial: atendido")).toBeInTheDocument();
  expect(screen.getByLabelText("8 caracteres: pendente")).toBeInTheDocument();
  expect(screen.getByLabelText("1 letra maiúscula: pendente")).toBeInTheDocument();
});

it("requires matching passwords and accepts without sending a phone", async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ accepted: true }), {
    status: 201,
    headers: { "content-type": "application/json" },
  }));
  render(<AcceptInvitePage />);

  const password = await screen.findByLabelText("Senha");
  const confirmation = screen.getByLabelText("Confirmar senha");
  const submit = screen.getByRole("button", { name: "Aceitar convite" });
  fireEvent.change(password, { target: { value: "Senha123!" } });
  fireEvent.change(confirmation, { target: { value: "diferente" } });
  expect(submit).toBeDisabled();
  expect(screen.getByText("As senhas não coincidem.")).toBeInTheDocument();

  fireEvent.change(confirmation, { target: { value: "Senha123!" } });
  expect(submit).toBeEnabled();
  fireEvent.click(submit);

  await screen.findByText("Convite aceito");
  expect(fetchMock).toHaveBeenLastCalledWith("/auth/invites/accept", expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ token: "invite-token", password: "Senha123!" }),
  }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
});
