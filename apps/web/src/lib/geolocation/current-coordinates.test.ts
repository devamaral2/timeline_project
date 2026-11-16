import { afterEach, expect, test, vi } from "vitest";
import { currentCoordinates } from "./current-coordinates";

afterEach(() => vi.unstubAllGlobals());

test("returns the latitude and longitude the browser reads", async () => {
  vi.stubGlobal("navigator", {
    geolocation: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: -23.5, longitude: -46.6 } } as GeolocationPosition) },
  });
  expect(await currentCoordinates()).toEqual({ latitude: -23.5, longitude: -46.6 });
});

test("a denied permission or missing support gives no coordinates", async () => {
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) => fail({} as GeolocationPositionError) } });
  expect(await currentCoordinates()).toBeUndefined();
  vi.stubGlobal("navigator", {});
  expect(await currentCoordinates()).toBeUndefined();
});
