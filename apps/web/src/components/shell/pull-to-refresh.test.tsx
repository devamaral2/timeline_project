import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PULL_LIMIT, type PullRefresh, pullTravel, usePullRefresh } from "@/lib/navigation/pull-refresh";
import { pullDown } from "@/test/pull-down";
import { PullToRefresh } from "./pull-to-refresh";

/** Uma tela que publica a releitura dela, como a Agenda e as listas fazem. */
function Screen({ refresh, enabled }: { refresh: PullRefresh; enabled?: boolean }) {
  usePullRefresh(refresh, enabled);
  return <main>Conteúdo</main>;
}

/** O disco do indicador: o pai do aviso que o leitor de tela ouve. */
function indicator(): HTMLElement {
  const element = screen.getByRole("status").parentElement;
  if (!element) throw new Error("indicador fora da tela");
  return element;
}

async function passTime(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
});

test("puxar além do limite e soltar relê a tela, e o indicador avisa até a leitura terminar", async () => {
  let finish: () => void = () => {};
  const refresh = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  render(<><PullToRefresh /><Screen refresh={refresh} /></>);

  pullDown();

  expect(refresh).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status")).toHaveTextContent("Atualizando…");
  expect(indicator()).toHaveAttribute("data-phase", "refreshing");

  // Mesmo depois de um bom tempo, o indicador só recolhe quando a leitura termina.
  await passTime(3000);
  expect(indicator()).toHaveAttribute("data-phase", "refreshing");

  finish();
  await passTime(0);
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
  expect(indicator()).toHaveAttribute("data-phase", "idle");
});

test("uma leitura instantânea ainda deixa o indicador girar um instante", async () => {
  render(<><PullToRefresh /><Screen refresh={() => {}} /></>);

  pullDown();
  await passTime(100);
  expect(indicator()).toHaveAttribute("data-phase", "refreshing");

  await passTime(400);
  expect(indicator()).toHaveAttribute("data-phase", "idle");
});

test("o indicador desce com o dedo e acende quando soltar já vale", () => {
  render(<><PullToRefresh /><Screen refresh={() => {}} /></>);

  pullDown({ by: 80, release: false });
  expect(indicator()).toHaveAttribute("data-phase", "pulling");
  expect(indicator().style.getPropertyValue("--pull")).toBe("40px");
  expect(indicator()).not.toHaveAttribute("data-armed");

  pullDown({ by: 160, release: false });
  expect(indicator().style.getPropertyValue("--pull")).toBe("80px");
  expect(indicator()).toHaveAttribute("data-armed");
});

test("soltar antes do limite não relê nada e o indicador recolhe", () => {
  const refresh = vi.fn();
  render(<><PullToRefresh /><Screen refresh={refresh} /></>);

  pullDown({ by: 100 });

  expect(refresh).not.toHaveBeenCalled();
  expect(indicator()).toHaveAttribute("data-phase", "idle");
  expect(indicator().style.getPropertyValue("--pull")).toBe("0px");
});

test("tela sem releitura publicada não tem o gesto", () => {
  const refresh = vi.fn();
  render(<><PullToRefresh /><Screen refresh={refresh} enabled={false} /></>);

  pullDown({ release: false });

  expect(indicator()).toHaveAttribute("data-phase", "idle");
  expect(refresh).not.toHaveBeenCalled();
});

test("arrastar para o lado é do carrossel, não é puxão", () => {
  const refresh = vi.fn();
  render(<><PullToRefresh /><Screen refresh={refresh} /></>);

  pullDown({ by: 120, across: 300 });

  expect(refresh).not.toHaveBeenCalled();
});

test("com a página rolada, arrastar para baixo é rolagem", () => {
  const refresh = vi.fn();
  render(<><PullToRefresh /><Screen refresh={refresh} /></>);
  Object.defineProperty(window, "scrollY", { value: 300, configurable: true });

  pullDown();

  expect(refresh).not.toHaveBeenCalled();
});

test("o toque que começa num painel fixo ou numa lista com rolagem própria não puxa a página", () => {
  const refresh = vi.fn();
  render(
    <>
      <PullToRefresh />
      <Screen refresh={refresh} />
      <div style={{ position: "fixed" }}><button type="button">Na barra</button></div>
      <ul data-testid="lista" style={{ overflowY: "auto" }}><li>Na lista</li></ul>
    </>,
  );
  const list = screen.getByTestId("lista");
  Object.defineProperty(list, "scrollHeight", { value: 900 });
  Object.defineProperty(list, "clientHeight", { value: 300 });

  pullDown({ from: screen.getByRole("button", { name: "Na barra" }) });
  pullDown({ from: screen.getByText("Na lista") });
  expect(refresh).not.toHaveBeenCalled();

  pullDown({ from: screen.getByText("Conteúdo") });
  expect(refresh).toHaveBeenCalledTimes(1);
});

test("com uma leitura em curso, outro puxão não pede mais uma", async () => {
  const refresh = vi.fn(() => new Promise<void>(() => {}));
  render(<><PullToRefresh /><Screen refresh={refresh} /></>);

  pullDown();
  pullDown();

  expect(refresh).toHaveBeenCalledTimes(1);
});

test("a releitura que falha, ou que nunca termina, não prende o indicador", async () => {
  const refresh = vi.fn<PullRefresh>()
    .mockImplementationOnce(() => Promise.reject(new Error("sem rede")))
    .mockImplementationOnce(() => new Promise<void>(() => {}));
  render(<><PullToRefresh /><Screen refresh={refresh} /></>);

  pullDown();
  await passTime(500);
  expect(indicator()).toHaveAttribute("data-phase", "idle");

  pullDown();
  await passTime(19_000);
  expect(indicator()).toHaveAttribute("data-phase", "refreshing");
  await passTime(1500);
  expect(indicator()).toHaveAttribute("data-phase", "idle");
});

test("a tela que está montada por cima é a que relê", () => {
  const list = vi.fn();
  const detail = vi.fn();
  const { rerender } = render(<><PullToRefresh /><Screen refresh={list} /></>);

  rerender(<><PullToRefresh /><Screen refresh={list} /><Screen refresh={detail} /></>);
  pullDown();
  expect(detail).toHaveBeenCalledTimes(1);
  expect(list).not.toHaveBeenCalled();
});

test("com o shell montado, o puxão do navegador fica desligado", () => {
  const { unmount } = render(<PullToRefresh />);
  expect(document.documentElement).toHaveAttribute("data-pull-refresh");

  unmount();
  expect(document.documentElement).not.toHaveAttribute("data-pull-refresh");
});

test("o indicador anda metade do dedo e para no limite", () => {
  expect(pullTravel(-40)).toBe(0);
  expect(pullTravel(100)).toBe(50);
  expect(pullTravel(5000)).toBe(PULL_LIMIT);
});
