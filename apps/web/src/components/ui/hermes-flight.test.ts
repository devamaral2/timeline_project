import { afterEach, expect, test, vi } from "vitest";
import { boxOf, canFly, flightKeyframes } from "./hermes-flight";

const button = { left: 300, top: 737, width: 52, height: 52 };
const mark = { left: 22, top: 618, width: 28, height: 28 };

afterEach(() => vi.unstubAllGlobals());

test("the flight leaves the bar button untouched and lands exactly on the status mark", () => {
  const frames = flightKeyframes(button, mark, true);

  expect(frames[0]?.transform).toBe("translate(0px, 0px) scale(1)");
  // Centro a centro: 36 - 326 = -290 e 632 - 763 = -131; 28 / 52 = 0,538.
  expect(frames.at(-1)?.transform).toBe("translate(-290px, -131px) scale(0.538)");
});

test("the button runs sideways before it climbs", () => {
  const [, second] = flightKeyframes(button, mark, true);

  expect(second?.transform).toBe("translate(-109.91px, 0px) scale(0.98)");
});

test("the way back is the same path in reverse", () => {
  const out = flightKeyframes(button, mark, true).map((frame) => frame.transform);
  const back = flightKeyframes(button, mark, false).map((frame) => frame.transform);

  expect(back).toEqual(out.reverse());
});

test("an element that is not on screen has no box", () => {
  const hidden = document.createElement("span");

  expect(boxOf(hidden)).toBeNull();
  expect(boxOf(null)).toBeNull();
});

test("the flight is only for people who did not ask for less motion", () => {
  const media = (matching: string[]) => vi.fn((query: string) => ({ matches: matching.includes(query) }));

  vi.stubGlobal("matchMedia", media([]));
  expect(canFly()).toBe(true);

  vi.stubGlobal("matchMedia", media(["(prefers-reduced-motion: reduce)"]));
  expect(canFly()).toBe(false);
});
