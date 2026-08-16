import { expect, test, vi } from "vitest";
import { FirestoreTagDao } from "./firestore-tag.dao";

const firestore = vi.hoisted(() => ({
  doc: vi.fn(() => "tag-ref"),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: firestore.doc,
  documentId: vi.fn(),
  endAt: vi.fn(),
  getDoc: firestore.getDoc,
  getDocs: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  setDoc: firestore.setDoc,
  startAt: vi.fn(),
}));

test("keeps the original creation timestamp when a tag already exists", async () => {
  firestore.getDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({ createdAt: "2026-08-15T00:00:00.000Z" }),
  });
  firestore.setDoc.mockResolvedValue(undefined);

  const dao = new FirestoreTagDao({} as never);
  await dao.upsert({
    id: "gym",
    name: "gym",
    createdBy: "user-1",
    createdAt: "2026-08-16T00:00:00.000Z",
    updatedAt: "2026-08-16T00:00:00.000Z",
  });

  expect(firestore.setDoc).toHaveBeenCalledWith(
    "tag-ref",
    expect.objectContaining({ createdAt: "2026-08-15T00:00:00.000Z" }),
    { merge: true },
  );
});
