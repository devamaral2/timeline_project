> **Substituído pela [ADR 0005](../adr/0005-skills-e-agentes-do-hermes-como-arquivos.md).** Este documento descreve a configuração do agente guardada no banco, que foi removida junto com o chat legado.

# Configuração editável do agente: trabalho realizado

Estado em 2026-11-08, branch `feat/ai-process-route`. Nada foi commitado.

## Objetivo

Permitir que o dono edite pela aplicação os textos e limites do agente de roteamento (JEV), dos agentes de entidade (criação, edição e consulta) e, depois, dos agentes e skills do Hermes, com a mudança valendo nos sistemas em execução sem reinício.

## Decisões da entrevista

- O banco é a fonte da verdade; os JSON do repositório são o "padrão de fábrica".
- Publicar vale ao salvar, sem reiniciar. Validação é publicar e reverter, com teste de frases opcional.
- Editável: textos e limites (passos, custo, timeouts, limiar de certeza). O modelo de cada rota não é editável.
- Escopo: todos os agentes de criar, editar e consultar entidades, mais o agente de roteamento. Não é uma tela única com todos os textos.
- Histórico: instantâneo do conjunto inteiro, sem limite. Só o dono edita.
- Hermes: sincronização automática junto da publicação, lendo o volume antes de gravar; alterações feitas pelo Hermes viram instantâneos com origem Hermes; se o Hermes estiver fora, a publicação vale e fica uma pendência visível, reenviada a cada 5 minutos. Skills mudam na próxima sessão do Hermes. Skills e agentes já existentes no volume são importados e editáveis.

## Documentos

- [CONTEXT.md](../CONTEXT.md): linguagem ubíqua (11 termos).
- ADRs 0001 a 0004 em `docs/adr/`, todas `accepted`: banco como fonte, publicação sem reinício com reversão, sincronização com o Hermes junto da publicação, edição restrita ao dono.
- [TDD](tdd/configuracao-agente.md), [PRD](prd/configuracao-agente.md) e [runbook](runbook/configuracao-agente.md), em rascunho.

## Implementação (backend, pronta e testada)

**Persistência**
- Schema [agent-config.ts](../apps/api/src/infrastructure/persistence/database/schema/agent-config.ts): `agent_config_versions` (id, user_id, origin, source_version_id, documents jsonb, created_at) e `agent_config_active` (user_id, version_id, updated_at).
- Migração `apps/api/drizzle/0023_agent_config_versions.sql` (ainda não aplicada).
- Repositório Postgres em `infrastructure/persistence/agent-config/`, registrado no `PersistenceModule` com o token `AGENT_CONFIG_REPOSITORY`.

**Configuração viva**
- [agent-config.ts](../apps/api/src/api-core/agent/config/agent-config.ts): schemas zod, `FACTORY_AGENT_CONFIG`, `parseAgentConfig` com checagem de referências cruzadas (rotas, skills, critérios), `activateAgentConfig` e visões vivas (`agentsConfig`, `jevRoutingConfig`, `promptsConfig`, `skillsConfig`) que leem a versão ativa a cada acesso.
- Um pedido lê uma única versão do começo ao fim: `RunAgentUseCase.execute` roda dentro de `withConfigSnapshot`, que fixa a versão ativa no contexto assíncrono do pedido. Uma publicação que chega no meio vale só para o pedido seguinte (ADR 0002).
- Consumidores ajustados para ler no momento do uso: skills (`defineAgentSkill` com getters), `run-agent.usecase`, gateway OpenRouter, prompt builder, planejador rápido, especialista de entidade e roteador JEV.

**Serviço**
- [agent-config.service.ts](../apps/api/src/api-core/agent/config/agent-config.service.ts): `start`, `publish`, `revert`, `restoreFactory`, `list`, `get`. Toda publicação é validada antes de ativar; se for inválida, a versão anterior continua. A validação recusa skill com código e sem entrada em `skills.json` (e o inverso), placeholder `{{x}}` que o texto não recebe, skill de escrita na rota de consulta e skill de leitura como destino de escrita. Campos fixos (`model` e `endpoint` do JEV, `targetSkills`, `prompt`/`readSkills`/`writeSkills` das rotas, `fast.skills`) vêm sempre do padrão de fábrica: uma edição que os toque é recusada, e reversão e restauração aplicam os valores de hoje ao instantâneo antigo. As publicações, reversões e restaurações entram numa fila (uma por vez), para o banco e a memória terminarem na mesma versão. Na subida, se a versão gravada não puder ser lida ou não validar, a API usa o padrão de fábrica e registra o erro. Reversão cria um instantâneo novo (origem `reversao`) apontando para o original.

**API (só o dono)**
- [agent-config.controller.ts](../apps/api/src/features/agent-config/agent-config.controller.ts), em `/api/ai/config`: `GET /`, `GET /versions/:id`, `POST /versions`, `POST /versions/:id/revert`, `POST /padrao`.
- Dono definido por `AGENT_CONFIG_OWNER_USER_ID` (opcional em `env.ts`). Sem a variável, ou com outro usuário, a resposta é 403. Um bootstrap carrega a versão ativa na subida.

**Testes**
- 24 testes do serviço (13 cobrem a validação, os campos fixos, o instantâneo gravado antes de um deploy e as publicações simultâneas), 9 do módulo de configuração (5 do instantâneo por pedido), 1 do caso de uso com publicação no meio do turno e 7 do controller. Suíte de agente, configuração e controller: 242 testes passando; typecheck da API e lint dos arquivos de configuração limpos.

## Pendente

1. **Sincronização com o Hermes.** Bloqueada pela escolha do mecanismo. O volume `/opt/data` não pode ser aberto por dois containers, então a API não grava direto. Opções: Hermes lê a configuração do MCP no início da sessão, ou sidecar no pod do Hermes como único dono do volume. Falta também a tabela de pendências e o reenvio a cada 5 minutos.
2. **Tela web de edição** (por agente, histórico, publicar, reverter, restaurar padrão, teste de frases opcional) e a **paridade mobile** exigida pelo AGENTS.md, com linha em `docs/mobile-parity.md`.
3. **Agentes de processo** (`process/agents/*.md`, `process/jev/*.json`) ainda fora do store.
4. **Banco real.** Rodar `pnpm db:migrate`, definir `AGENT_CONFIG_OWNER_USER_ID` e exercitar o repositório Postgres, que só passou no typecheck e nos testes com repositório em memória.
5. **Verificar no Hermes instalado** o diretório de skills no volume e o comando de recarga.

## Fora do escopo desta mudança

Alterações já pendentes na árvore que não são deste trabalho: arquivos de notas e tarefas em `apps/web`, a remoção de `cursor-sonnet/reposcope`, `docs/mobile-parity.md` e a pasta Mockup.
