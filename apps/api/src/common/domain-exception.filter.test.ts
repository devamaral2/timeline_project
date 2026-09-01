import { expect, test } from "vitest";
import {
  EventNotFoundError,
  EventOwnershipError,
  EventRevisionConflictError,
  EventValidationError,
} from "@repo/entities";
import { statusOf } from "../events/testing/status-of";

test("maps EventValidationError to 400", () => {
  expect(statusOf(new EventValidationError("bad input"))).toBe(400);
});

test("maps EventOwnershipError to 403", () => {
  expect(statusOf(new EventOwnershipError())).toBe(403);
});

test("maps EventNotFoundError to 404", () => {
  expect(statusOf(new EventNotFoundError("Event not found"))).toBe(404);
});

test("maps EventRevisionConflictError to 409", () => {
  expect(statusOf(new EventRevisionConflictError("Expected revision 1 but found 2"))).toBe(409);
});

test("maps unexpected errors to 500", () => {
  expect(statusOf(new Error("boom"))).toBe(500);
});
