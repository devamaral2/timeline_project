import React from "react";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import TimelinePage from "./page";

test("renders the public app shell links", () => {
  render(<TimelinePage />);

  expect(
    screen.getByRole("heading", { name: /all tracker/i }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /timeline/i })).toHaveAttribute(
    "href",
    "/",
  );
  expect(screen.getByRole("link", { name: /daily overview/i })).toHaveAttribute(
    "href",
    "/daily",
  );
});
