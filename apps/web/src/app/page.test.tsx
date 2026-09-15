import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import TimelinePage from "./page";

const replace = vi.fn();
let session: { user: { userId: string } | null; ready: boolean } = { user: null, ready: true };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/lib/session/use-session", () => ({
  useSessionState: () => session,
}));

vi.mock("@/components/auth/LoginForm", () => ({
  LoginForm: () => <form aria-label="Entrar" />,
}));

beforeEach(() => {
  replace.mockReset();
  session = { user: null, ready: true };
});

test("shows the login form when no user is authenticated", () => {
  render(<TimelinePage />);

  expect(screen.getByRole("form", { name: "Entrar" })).toBeInTheDocument();
  expect(replace).not.toHaveBeenCalled();
});

test("shows nothing while the session is still being resolved", () => {
  session = { user: null, ready: false };

  render(<TimelinePage />);

  expect(screen.queryByRole("form", { name: "Entrar" })).toBeNull();
});

test("redirects to the user's timeline once authenticated", () => {
  session = { user: { userId: "user-42" }, ready: true };

  render(<TimelinePage />);

  expect(replace).toHaveBeenCalledWith("/user-42");
});
