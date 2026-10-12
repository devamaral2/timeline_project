# Configuração do agente

Tudo o que o agente lê ou usa como parâmetro está nesta pasta, em JSON. O código
(`../run-agent.usecase.ts`, `../routing`, `../gateways`, `../skills`) só aplica.
`agent-config.ts` valida os arquivos ao subir: campo faltando, skill inexistente ou
placeholder `{{x}}` sem valor derrubam o processo na carga, não no pedido de um usuário.

| Arquivo | O que define | Quem lê |
| --- | --- | --- |
| `jev-routing.json` | Chamada ao JEV: endpoint, modelo, timeout, limiar de certeza, as 3 perguntas (`goal`, `count`, `target`) e o mapa `target → skill` | `routing/jev-agent.router.ts` |
| `agents.json` | As rotas (`read`, `single`, `complex`): quais skills cada uma recebe e qual prompt usa; limites de execução | `run-agent.usecase.ts`, gateway, `get-day-context.skill.ts` |
| `skills.json` | Por skill: `description` (tool), `instructions` (system prompt) e `progressLabel` (chat) | cada `skills/*.skill.ts` via `skillText()` |
| `prompts.json` | Todos os textos de system prompt (legado e roteado), contexto de tela, verificação de escrita e respostas montadas pelo servidor | `services/agent-prompt-builder.service.ts`, `run-agent.usecase.ts` |

Não estão aqui, de propósito: os argumentos de cada skill (schemas Zod, em `skills/*.skill.ts`,
porque são tipos), os modelos do OpenRouter e as chaves (variáveis de ambiente), e a regra de
decisão do roteador (código em `jev-agent.router.ts`: exige `confidence` e `probabilities[choice]`
acima de `minCertainty`).

## Fluxo de um pedido (`POST /api/ai` e chat)

```
texto ─► JEV (jev-routing.json: goal / count / target)
          │  falha, timeout, certeza ≤ 0,92 ou sem JEV_API_KEY ─► complex
          ├─ goal=read                                 ─► rota read    (agents.json)
          ├─ goal=write + count=one + target conhecido ─► rota single  (skill de targetSkills)
          └─ qualquer outro caso                       ─► rota complex (todas as skills de escrita)

rota ─► prompt (prompts.json + skills.json + schema do banco) ─► OpenRouter (limits de agents.json)
     ─► leitura: get_day_context / query_data
     ─► escrita: JSON {commands, clarification, report} ─► Zod da skill ─► rearranjo do dia ─► commit atômico
     ─► agentResponse (prompts.json › responses)
```

Sem roteador (sem `JEV_API_KEY` fora de produção) vale o caminho `legacy` de `prompts.json`,
com todas as skills em todo turno.

## Como mudar

- **Instrução de uma skill:** `skills.json`.
- **Quais skills uma rota recebe:** `agents.json › routes`. `writeSkills` aceita uma lista, `"routed"`
  (a skill escolhida pelo JEV) ou `"all"` (todas as de escrita).
- **Novo tipo de entidade roteável:** criar a skill e seu texto em `skills.json`, registrá-la em
  `skills/agent-skill-registry.ts`, e acrescentar o critério em `jev-routing.json › questions.target`
  e a linha em `targetSkills`. Se `kind: "single"` ganhar um valor novo, ajustar `routing/agent-router.ts`.
- **Perguntas ao JEV:** `jev-routing.json › questions`. Mudar nomes de opções (`read`, `write`, `one`)
  exige mudar também `jev-agent.router.ts`.
- **Limites (passos, custo, timeouts):** `agents.json › limits`.

Depois de qualquer mudança: `pnpm --filter @repo/api exec vitest run src/api-core/agent` e, para
medir o efeito no roteamento, `scripts/evaluate-jev-routing.ts`
(ver `.agents/docs/ai-dialog/implementation-status.md`).
