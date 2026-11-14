import { describe, expect, test } from "vitest";
import { toolLabel } from "./hermes-tool-labels";

describe("toolLabel", () => {
  test("as ferramentas do MCP da agenda ficam em portugues", () => {
    expect(toolLabel("mcp_braid_create_artifact")).toBe("Criou um artefato");
    expect(toolLabel("mcp_braid_update_event")).toBe("Editou um evento");
    expect(toolLabel("mcp_braid_list_tracked_events")).toBe("Listou os eventos acompanhados");
  });

  test("as ferramentas conhecidas do Hermes tem rotulo proprio e as demais mostram o nome", () => {
    expect(toolLabel("terminal")).toBe("Executou um comando");
    expect(toolLabel("some_new_tool")).toBe("Usou some new tool");
  });
});
