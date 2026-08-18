import React from "react";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import TimelinePage from "./page";

test("renders the hello world placeholder", () => {
  render(<TimelinePage />);

  expect(
    screen.getByRole("heading", { level: 1, name: /hello world/i }),
  ).toBeInTheDocument();
});
