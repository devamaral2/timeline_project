declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown";

  /** Tabelas, riscado e listas de tarefas do GFM. */
  export const gfm: TurndownService.Plugin;
}
