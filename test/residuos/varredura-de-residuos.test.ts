import { describe, expect, it } from "vitest";
import { ARQUIVOS_COM_OUTRO_EVENTO, EXCECOES, EXCECOES_DE_LINHA, linhaTemResiduo, varrer } from "./varredura";

describe("varredura de residuos de evento", () => {
  it("nao deixa nenhum residuo fora da lista de excecoes", () => {
    const residuos = varrer();
    const mensagens =
      residuos.length === 0
        ? []
        : [
            `Residuo(s) de "event"/"evento" (${residuos.length}). Troque pelo nome de tarefa:`,
            ...residuos.slice(0, 50).map((r) => `  ${r.arquivo}${r.linha ? `:${r.linha}` : ""}  ${r.texto.slice(0, 160)}`),
            ...(residuos.length > 50 ? [`  ... e mais ${residuos.length - 50}`] : []),
          ];
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
    for (const e of [...EXCECOES, ...EXCECOES_DE_LINHA, ...ARQUIVOS_COM_OUTRO_EVENTO]) expect(e.motivo.length).toBeGreaterThan(10);
    // Teto: 12 palavras/linhas excetuadas e 6 grupos de arquivos (Auth, Hermes, licencas, migrations, testes do nome antigo).
    expect(EXCECOES.length + EXCECOES_DE_LINHA.length).toBeLessThanOrEqual(12);
    expect(ARQUIVOS_COM_OUTRO_EVENTO.length).toBeLessThanOrEqual(6);
  });
});
