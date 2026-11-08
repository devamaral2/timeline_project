# Configuração do agente

Tudo o que o agente lê ou usa como parâmetro está nesta pasta, em JSON. O código
(`../run-agent.usecase.ts`, `../routing`, `../gateways`, `../skills`) só aplica.

**Estes arquivos são o padrão de fábrica.** A versão em vigor vive no banco
(`agent_config_versions` / `agent_config_active`) e é editada pela aplicação, pelo dono
(`AGENT_CONFIG_OWNER_USER_ID`, rotas `/api/ai/config`). `agent-config.ts` lê a versão ativa
a cada uso, então uma publicação vale no pedido seguinte, sem reiniciar. Um pedido lê uma
única versão do começo ao fim (`withConfigSnapshot`, aplicado em `RunAgentUseCase.execute`):
uma publicação que chega no meio dele não o afeta. As publicações entram numa fila, uma por
vez, para que o banco e a memória terminem na mesma versão. Cada publicação
grava um instantâneo do conjunto inteiro; a reversão cria um instantâneo novo a partir de
um anterior; `POST /api/ai/config/padrao` volta a estes arquivos.

Tudo é validado antes de virar a versão ativa (`parseAgentConfig`), e uma publicação
inválida é recusada com a versão anterior valendo. A validação recusa: campo faltando;
skill com código e sem entrada em `skills.json`, ou entrada sem código; referência quebrada
entre roteador e skills; skill de escrita na rota de consulta (`readSkills` só aceita
`query_data` e `get_day_context`) ou skill de leitura como destino de escrita; e placeholder
`{{x}}` que o texto não recebe (as chaves aceitas por texto estão em `PLACEHOLDERS`, em
`agent-config.ts`; ao incluir um `fill()` novo, atualize a tabela).

Editável pela aplicação: textos (instruções, prompts, descrições) e parâmetros de limite
(passos, custo, timeouts, limiar de certeza). **Fixos, sempre os deste repositório:** o `model`
e o `endpoint` do JEV, o mapa `targetSkills` e, em cada rota, `prompt`, `readSkills` e
`writeSkills`, além de `fast.skills` (`PINNED_FIELDS`). Uma edição que toque um deles é
recusada. Reversão e restauração do padrão aplicam os valores fixos de hoje (e o conjunto de
skills do código) ao instantâneo antigo, então trocar o modelo aqui vale no deploy seguinte.

Na subida, se a versão gravada não puder ser lida ou não validar mais, a API usa o padrão de
fábrica e registra o erro em vez de cair.

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

## Pipeline rápido (`AI_PIPELINE=fast`, ADR 002)

```
texto ─► planejador (prompts.json › fast.planner; uma chamada estruturada)
          ├─ read / other / falha / JSON inválido ─► fluxo acima (JEV + agente), `fast_fallback` na trilha
          ├─ clarify                              ─► pergunta ao usuário, nada é gravado
          └─ write: operações ─► um especialista por operação, em paralelo (fast.specialist)
                                 + dia lido pelo servidor ─► junção na mesma sessão ─► rearranjo ─► commit único
```

Limites e skills cobertas: `agents.json › fast`. Sem `AI_PIPELINE=fast` nada disso roda.

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
