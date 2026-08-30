import { beforeEach, expect, test, vi } from "vitest";
import { signInWithGoogle, signOutFromGoogle } from "./google-sign-in.web";

const firebase = vi.hoisted(() => ({
  auth: { name: "auth" },
  provider: { providerId: "google.com" },
  resolver: { name: "browser-popup-resolver" },
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("./app", () => ({
  getClientAuth: () => firebase.auth,
}));

vi.mock("firebase/auth", () => ({
  browserPopupRedirectResolver: firebase.resolver,
  GoogleAuthProvider: vi.fn(() => firebase.provider),
  signInWithPopup: firebase.signInWithPopup,
  signOut: firebase.signOut,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test("signs in through the Firebase browser popup", async () => {
  firebase.signInWithPopup.mockResolvedValue({ user: { uid: "user-1" } });

  await expect(signInWithGoogle()).resolves.toBe("signed-in");
  expect(firebase.signInWithPopup).toHaveBeenCalledWith(
    firebase.auth,
    firebase.provider,
    firebase.resolver,
  );
});

test("treats a closed browser popup as a cancelled sign-in", async () => {
  firebase.signInWithPopup.mockRejectedValue(
    Object.assign(new Error("popup closed"), { code: "auth/popup-closed-by-user" }),
  );

  await expect(signInWithGoogle()).resolves.toBe("cancelled");
});

test("signs out from the Firebase browser session", async () => {
  firebase.signOut.mockResolvedValue(undefined);

  await signOutFromGoogle();

  expect(firebase.signOut).toHaveBeenCalledWith(firebase.auth);
});
