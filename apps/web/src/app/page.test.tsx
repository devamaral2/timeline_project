import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import TimelinePage from "./page";

const replace = vi.fn();
let currentUser: { userId: string } | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/lib/session/use-session", () => ({
  useCurrentUser: () => currentUser,
}));

vi.mock("@/components/auth/GoogleSignInButton", () => ({
  GoogleSignInButton: () => <button type="button">Entrar com Google</button>,
}));

beforeEach(() => {
  replace.mockReset();
  currentUser = null;
});

test("shows the sign-in button when no user is authenticated", () => {
  render(<TimelinePage />);

  expect(screen.getByRole("button", { name: "Entrar com Google" })).toBeInTheDocument();
  expect(replace).not.toHaveBeenCalled();
});

test("redirects to the user's timeline once authenticated", () => {
  currentUser = { userId: "user-42" };

  render(<TimelinePage />);

  expect(replace).toHaveBeenCalledWith("/user-42");
});
