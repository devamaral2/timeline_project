import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventScheduleFields, longDate, maskDate, maskTime, parseShortDate } from "./event-schedule-fields";

describe("event schedule fields", () => {
  it("formats and validates Brazilian dates", () => {
    expect(maskDate("14092026")).toBe("14/09/2026");
    expect(parseShortDate("14/09/2026")).toBe("2026-09-14");
    expect(parseShortDate("31/02/2026")).toBeNull();
    expect(longDate("2026-09-14")).toContain("14 de set.");
  });

  it("restricts time input to the 24-hour clock", () => {
    expect(maskTime("2359")).toBe("23:59");
    expect(maskTime("2400")).toBeNull();
    expect(maskTime("1260")).toBeNull();
  });

  it("switches from the readable date to DD/MM/YYYY while editing", () => {
    const onChange = vi.fn();
    render(<EventScheduleFields startDate="2026-09-14" startTime="09:00" endDate="2026-09-14" endTime="10:00" activeField={null} onChange={onChange} onOpenCalendar={vi.fn()} />);

    const startDate = screen.getByLabelText("Início: data");
    expect((startDate as HTMLInputElement).value).toContain("14 de set.");
    fireEvent.focus(startDate);
    expect(startDate).toHaveValue("14/09/2026");
    fireEvent.change(startDate, { target: { value: "15/09/2026" } });
    fireEvent.blur(startDate);
    expect(onChange).toHaveBeenCalledWith("startDate", "2026-09-15");
  });
});
