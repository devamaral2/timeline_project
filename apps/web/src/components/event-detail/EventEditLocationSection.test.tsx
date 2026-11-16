import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapsUrl } from "@/lib/events/maps-link";

const places = vi.hoisted(() => ({ searchPlaces: vi.fn() }));
vi.mock("@/lib/api/places", () => ({ searchPlaces: places.searchPlaces }));
const geolocation = vi.hoisted(() => ({ currentCoordinates: vi.fn() }));
vi.mock("@/lib/geolocation/current-coordinates", () => ({ currentCoordinates: geolocation.currentCoordinates }));

const { EventEditLocationSection } = await import("./EventEditLocationSection");

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <EventEditLocationSection value={value} onChange={setValue} />;
}

const IBIRAPUERA = { name: "Parque Ibirapuera", address: "São Paulo, SP", label: "Parque Ibirapuera, São Paulo, SP" };

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  places.searchPlaces.mockReset();
  places.searchPlaces.mockResolvedValue([IBIRAPUERA]);
  geolocation.currentCoordinates.mockReset();
  geolocation.currentCoordinates.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("campo Local", () => {
  it("busca o que a pessoa digita e escolher a sugestão grava o endereço completo", async () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Local" });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ibirapuera" } });
    await vi.advanceTimersByTimeAsync(350);

    const option = await screen.findByRole("button", { name: IBIRAPUERA.label });
    expect(places.searchPlaces).toHaveBeenCalledWith("ibirapuera", 6, undefined);
    fireEvent.click(option);

    expect(input).toHaveValue(IBIRAPUERA.label);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    // Escolher não dispara outra busca.
    await vi.advanceTimersByTimeAsync(350);
    expect(places.searchPlaces).toHaveBeenCalledTimes(1);
  });

  it("busca perto de onde a pessoa está, lendo a posição uma vez ao entrar no campo", async () => {
    const here = { latitude: -19.92, longitude: -43.94 };
    geolocation.currentCoordinates.mockResolvedValue(here);
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Local" });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "padaria" } });
    await vi.advanceTimersByTimeAsync(350);
    fireEvent.change(input, { target: { value: "padaria brasil" } });
    await vi.advanceTimersByTimeAsync(350);

    expect(places.searchPlaces).toHaveBeenLastCalledWith("padaria brasil", 6, here);
    expect(geolocation.currentCoordinates).toHaveBeenCalledTimes(1);
  });

  it("não busca com menos de três letras", async () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox", { name: "Local" }), { target: { value: "pa" } });
    await vi.advanceTimersByTimeAsync(350);

    expect(places.searchPlaces).not.toHaveBeenCalled();
  });

  it("Enter escolhe a sugestão destacada e a seta troca a destacada", async () => {
    places.searchPlaces.mockResolvedValue([IBIRAPUERA, { name: "Outro", address: "Rio", label: "Outro, Rio" }]);
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Local" });
    fireEvent.change(input, { target: { value: "parque" } });
    await vi.advanceTimersByTimeAsync(350);
    await screen.findByRole("listbox");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input).toHaveValue("Outro, Rio");
  });

  it("uma falha na busca não atrapalha: o texto digitado continua valendo", async () => {
    places.searchPlaces.mockRejectedValue(new Error("fora do ar"));
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Local" });
    fireEvent.change(input, { target: { value: "minha casa" } });
    await vi.advanceTimersByTimeAsync(350);

    await waitFor(() => expect(places.searchPlaces).toHaveBeenCalled());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("minha casa");
  });

  it("com um local preenchido, oferece abrir no Google Maps em outra aba", () => {
    render(<Harness initial="Av. Paulista, 1000, São Paulo" />);

    const link = screen.getByRole("link", { name: "Abrir no Google Maps" });
    expect(link).toHaveAttribute("href", mapsUrl("Av. Paulista, 1000, São Paulo"));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("sem local não há link", () => {
    render(<Harness />);
    expect(screen.queryByRole("link", { name: "Abrir no Google Maps" })).not.toBeInTheDocument();
  });
});

describe("mapsUrl", () => {
  it("codifica o texto na busca do Google Maps", () => {
    expect(mapsUrl(" Rua A, 10 & Cia ")).toBe("https://www.google.com/maps/search/?api=1&query=Rua%20A%2C%2010%20%26%20Cia");
  });
});
