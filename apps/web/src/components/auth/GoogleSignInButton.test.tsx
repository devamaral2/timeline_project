import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { GoogleSignInButton } from "./GoogleSignInButton";

vi.mock("@/lib/firebase/use-current-user", () => ({
  useCurrentUser: () => ({ uid: "user-1" }),
}));
vi.mock("@/lib/firebase/client-app", () => ({ getClientApp: vi.fn() }));
vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: vi.fn(),
  getAuth: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

test("shows a logout symbol when the compact label is visually hidden", () => {
  render(<GoogleSignInButton compactOnMobile />);

  const button = screen.getByRole("button", { name: "Sair" });
  expect(button.querySelector("svg")).not.toBeNull();
});
