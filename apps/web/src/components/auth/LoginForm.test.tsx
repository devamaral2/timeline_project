import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { LoginForm } from "./LoginForm";

const { signIn } = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock("@/lib/session/use-session", () => ({ signIn }));

beforeEach(() => {
  signIn.mockReset();
});

function fillAndSubmit(email = " ana@example.com ", password = "secret") {
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

test("signs in with the typed email and password", async () => {
  signIn.mockResolvedValue({ ok: true, user: { userId: "user-1", name: "Ana", email: "ana@example.com" } });
  const onSignedIn = vi.fn();
  render(<LoginForm onSignedIn={onSignedIn} />);

  fillAndSubmit();

  await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith("user-1"));
  expect(signIn).toHaveBeenCalledWith("ana@example.com", "secret");
});

test("keeps the submit disabled until both fields are filled", () => {
  render(<LoginForm />);

  expect(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();
});

test.each([
  ["invalid_credentials", "E-mail ou senha incorretos."],
  ["rate_limited", "Muitas tentativas. Aguarde um pouco e tente novamente."],
  ["unavailable", "Não foi possível entrar agora. Tente novamente em instantes."],
])("explains a %s failure", async (reason, message) => {
  signIn.mockResolvedValue({ ok: false, reason });
  render(<LoginForm />);

  fillAndSubmit();

  expect(await screen.findByRole("alert")).toHaveTextContent(message);
});
