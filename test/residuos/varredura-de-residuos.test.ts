import { describe, expect, it } from "vitest";
import { compararComALinhaDeBase, lerLinhaDeBase } from "./linha-de-base";
import { EXCECOES, EXCECOES_DE_LINHA, linhaTemResiduo, varrer } from "./varredura";

describe("varredura de residuos de evento", () => {
  it("nao deixa residuo novo fora da linha de base nem entrada que ja sumiu", () => {
    const { novos, sumidos } = compararComALinhaDeBase(varrer(), lerLinhaDeBase());
    const mensagens: string[] = [];
    if (novos.length > 0) {
      mensagens.push(
        `Residuo(s) de "event"/"evento" fora da linha de base (${novos.length}). Troque pelo nome de tarefa:`,
        ...novos.slice(0, 50).map((r) => `  ${r.arquivo}${r.linha ? `:${r.linha}` : ""}  [${r.area}]  ${r.texto.slice(0, 160)}`),
        ...(novos.length > 50 ? [`  ... e mais ${novos.length - 50}`] : []),
      );
    }
    if (sumidos.length > 0) {
      mensagens.push(
        `A linha de base so encolhe: ${sumidos.length} entrada(s) nao existem mais. Retire-as rodando \`pnpm run residuos:encolher\`:`,
        ...sumidos.slice(0, 50).map((e) => `  ${e.arquivo}  [${e.area}]  ${e.texto.slice(0, 160)}`),
        ...(sumidos.length > 50 ? [`  ... e mais ${sumidos.length - 50}`] : []),
      );
    }
    expect(mensagens.join("\n")).toBe("");
  });

  it("acha o nome da entidade em identificador, texto e rota", () => {
    for (const linha of [
      "export type EventDto = {}",
      "const eventId = 1",
      'fetch("/api/events")',
      "<h1>Novo evento</h1>",
      "create_event",
      "CREATE TABLE events (id text)",
      "// os eventos acompanhados",
    ]) {
      expect(linhaTemResiduo(linha), linha).toBe(true);
    }
  });

  it("libera as excecoes: DOM, teclado, handlers, text/event-stream e verbos", () => {
    for (const linha of [
      "window.addEventListener('keydown', onKey)",
      "function onKey(event: KeyboardEvent) {}",
      "onClick={(event) => open(event)}",
      "event.preventDefault();",
      "return new Response(body, { headers: { 'content-type': 'text/event-stream' } });",
      "fireEvent.click(botao); await userEvent.type(campo, 'a')",
      "const evitar = preventDefault",
      "pointer-events: none;",
    ]) {
      expect(linhaTemResiduo(linha), linha).toBe(false);
    }
  });

  it("mantem a lista de excecoes curta e com motivo", () => {
    for (const e of [...EXCECOES, ...EXCECOES_DE_LINHA]) expect(e.motivo.length).toBeGreaterThan(10);
    expect(EXCECOES.length + EXCECOES_DE_LINHA.length).toBeLessThanOrEqual(12);
  });
});
