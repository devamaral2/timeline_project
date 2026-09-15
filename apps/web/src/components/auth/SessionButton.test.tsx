import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { SessionButton } from "./SessionButton";

const { signOut, useCurrentUser, replace } = vi.hoisted(() => ({
  signOut: vi.fn(async () => {}),
  useCurrentUser: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/lib/session/use-session", () => ({ signOut, useCurrentUser }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

beforeEach(() => {
  signOut.mockClear();
  replace.mockClear();
});

test("signs out and goes back to the login screen", async () => {
  useCurrentUser.mockReturnValue({ userId: "user-1", name: "Ana", email: null });
  render(<SessionButton />);

  fireEvent.click(screen.getByRole("button", { name: "Sair" }));

  await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  expect(signOut).toHaveBeenCalledTimes(1);
});

test("offers the login screen to whoever is signed out", () => {
  useCurrentUser.mockReturnValue(null);
  render(<SessionButton compactOnMobile />);

  expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/");
});
