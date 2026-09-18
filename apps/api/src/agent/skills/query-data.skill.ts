import { z } from "zod";
import { defineAgentSkill } from "./agent-skill";

export const queryDataSkill = defineAgentSkill({
  name: "query_data",
  progressLabel: "Consultando seus dados",
  description:
    "Executa um SELECT em PostgreSQL sobre os eventos, tarefas e notas do usuário. Pode ser chamada várias vezes.",
  instructions: [
    "query_data — um único SELECT, só com as tabelas listadas abaixo e sem schema (nada de",
    "public.x), sem ';' no meio e sem parâmetros ($1). Ela já enxerga apenas os dados deste",
    "usuário, sem registros apagados — não filtre por usuário. Funções comuns de agregação, data,",
    "texto, número e jsonb estão liberadas; o erro explica o que foi recusado. Datas e horas já",
    "vêm em America/Sao_Paulo. O resultado tem no máximo 200 linhas: agregue no SQL em vez de",
    "trazer tudo.",
  ].join("\n"),
  parameters: z.object({
    sql: z.string().min(1).describe("Um único SELECT."),
  }),
  run: async (args, { session, query }) => query.run({ userId: session.userId, sql: args.sql }),
});
