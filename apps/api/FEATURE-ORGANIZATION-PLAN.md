# Refatoração estrutural e organização de features

## Resumo

Refatorar toda a estrutura da aplicação, com foco inicial na reorganização de
`apps/api`, sem deixar código morto no repositório:

- preservar rotas, payloads, respostas, regras de negócio, autenticação do gateway, WebSocket e banco;
- reorganizar `apps/web`, `apps/api`, `apps/auth` e os packages compartilhados em limites claros de responsabilidade;
- transformar cada operação pública em uma feature independente;
- remover agrupamentos artificiais como `features/events`, `features/tasks`, `features/recurrences` e `features/agent`;
- manter domínio, persistência, identidade e transporte como áreas técnicas compartilhadas;
- remover todo arquivo, componente, hook, serviço, export, asset, dependência e rota sem uso comprovado;
- não manter protótipos, mocks ou implementações paralelas dentro do caminho de produção.

## Escopo da refatoração estrutural

A refatoração será feita em todo o monorepo, e não apenas nos controllers da API:

- mapear entradas reais de cada app, rotas, módulos, providers, componentes, hooks, adapters, exports e dependências;
- separar código de produção, código de teste e material experimental/protótipo;
- alinhar a estrutura de cada app às suas responsabilidades: interface em `apps/web`, casos de uso e transporte em `apps/api`, identidade em `apps/auth` e contratos/domínio compartilhados nos packages;
- eliminar dependências circulares, imports por caminhos acidentais, barrels sem consumidores e módulos que só existem para reexportar código morto;
- mover código ainda usado para uma localização coerente antes de remover a árvore antiga;
- substituir a dependência de telas de produção em diretórios de mockup por componentes e rotas de produção com nomes próprios;
- remover fluxos de UI que apenas alteram estado local quando não forem parte de uma funcionalidade real suportada pelo produto;
- manter uma única implementação por comportamento: sem versões duplicadas de agenda, criação, edição, chat, autenticação ou acesso à API.

Essa etapa deve produzir um inventário antes de qualquer exclusão. Um item só será
considerado morto quando não houver referência de produção, teste, configuração,
entrypoint, geração de código ou contrato externo que o exija. Rotas públicas não
serão removidas apenas porque o `web` atual não as chama: primeiro será verificado
se fazem parte do contrato da API ou se existe outro consumidor.

## Política de eliminação de código morto

Para cada candidato, registrar a evidência e então remover:

- arquivos e diretórios sem imports ou entrypoints alcançáveis;
- exports públicos sem consumidores;
- componentes, hooks, helpers, estilos e assets sem uso no fluxo real ou nos testes;
- mocks, previews e protótipos que não sejam necessários para testes automatizados;
- use cases, gateways, DTOs, schemas e adapters sem wiring ou sem chamada de runtime;
- rotas, controllers e clientes HTTP sem consumidor comprovado, respeitando contratos externos;
- dependências declaradas mas não importadas e scripts/configurações sem referência;
- testes exclusivos de código removido e fixtures que não tenham mais consumidores.

Não será aceito deixar código “para uso futuro”, duplicado, comentado ou escondido
atrás de uma flag nunca ativada. Caso uma capacidade seja necessária, ela deve ter
um consumidor, um entrypoint e um teste que demonstre esse uso.

## Features propostas

| Feature | Rota |
|---|---|
| `list-timeline-events` | `GET /api/events` |
| `create-event` | `POST /api/events` |
| `get-daily-overview` | `GET /api/events/daily` |
| `create-event-from-transcript` | `POST /api/events/voice` |
| `get-event` | `GET /api/events/:eventId` |
| `update-event` | `PATCH /api/events/:eventId` |
| `delete-event` | `DELETE /api/events/:eventId` |
| `suggest-tags` | `GET /api/tags` |
| `list-tasks` | `GET /api/tasks` |
| `create-task` | `POST /api/tasks` |
| `get-task` | `GET /api/tasks/:taskId` |
| `list-subtasks` | `GET /api/tasks/:taskId/subtasks` |
| `update-task` | `PATCH /api/tasks/:taskId` |
| `delete-task` | `DELETE /api/tasks/:taskId` |
| `list-recurrences` | `GET /api/recurrences` |
| `create-recurrence` | `POST /api/recurrences` |
| `get-recurrence` | `GET /api/recurrences/:recurrenceId` |
| `update-recurrence` | `PATCH /api/recurrences/:recurrenceId` |
| `delete-recurrence` | `DELETE /api/recurrences/:recurrenceId` |
| `run-agent` | `POST /api/ai` |
| `issue-agent-chat-ticket` | `POST /api/ai/chat/tickets` |
| `list-agent-conversations` | `GET /api/ai/conversations` |
| `list-agent-chat-messages` | `GET /api/ai/conversations/:conversationId/messages` |
| `rename-agent-conversation` | `PATCH /api/ai/conversations/:conversationId` |
| `delete-agent-conversation` | `DELETE /api/ai/conversations/:conversationId` |
| `run-agent-chat-turn` | WebSocket `/api/ai/chat` |

Cada controller deverá atender uma única operação. Os módulos de cada feature registrarão apenas seu controller e wiring específico.

## Funcionalidades sem uso atual no `web`

O inventário atual do frontend deve orientar a refatoração, mas não será usado como
único critério para apagar contratos da API. Cada operação será classificada em uma
das três categorias:

1. capacidade necessária ao produto, que deverá ser integrada ao fluxo real do `web`;
2. contrato público ainda consumido por outro cliente, que deverá permanecer documentado e testado;
3. código sem consumidor nem contrato, que deverá ser removido junto dos testes e fixtures exclusivos.

Na auditoria atual, são candidatos à decisão as operações REST de tarefas e
recorrências, a criação manual direta de eventos, o overview diário, o endpoint
HTTP síncrono do agente e a renomeação de conversas. O painel de criação e os
fluxos de tarefas/notas que hoje apenas mantêm estado local não contam como uso de
produção; devem ser integrados ou removidos.

O cliente do `web` também deve ser revisado para eliminar funções exportadas sem
consumidor, clientes HTTP órfãos e tipos criados apenas para protótipos. Nenhuma
capacidade permanecerá implementada em duplicidade entre o fluxo real e o mockup.

## Código compartilhado

Criar uma área `src/api-core/` somente para capacidades usadas por mais de uma feature:

- preparação e criação de eventos, incluindo parsing de refeições;
- materialização de recorrências e templates usados por eventos e tarefas;
- regras compartilhadas de hierarquia e ownership de tarefas;
- execução compartilhada do agente, skills, prompt builder e sessão de mudanças;
- mapeadores DTO reutilizados pelo agente e pelas consultas HTTP.

Mover `request-identity` para `src/http/request-identity/`, pois guard, decorator e identidade são infraestrutura de transporte.

Mover `AgentChatServer`, `AgentChatConnection` e protocolo para `src/http/websocket/agent-chat/`. O WebSocket é um adaptador de transporte; `run-agent-chat-turn` continua sendo a operação de negócio.

Manter fora de `features`:

- `src/domain/`, incluindo `notes`, `catalog`, `agent` e `agent-chat`;
- `src/infrastructure/persistence/`;
- `src/common/`;
- `src/config/`;
- doubles e helpers de teste, reorganizados por capacidade ou próximos dos testes consumidores.

Não criar features HTTP para notas ou catálogo: atualmente eles são capacidades usadas pelo agente, sem endpoints próprios. Remover o gateway de parsing de alimentos não utilizado em runtime, junto dos testes exclusivos dele.

## Wiring do Nest

Criar um `ApiCoreModule.forRoot()` para registrar persistência e serviços compartilhados. Cada feature importará esse módulo explicitamente.

O `AppModule` ficará somente como composição de:

- `ApiCoreModule`;
- módulos das features;
- módulo do transporte WebSocket.

Remover os módulos agregadores `EventsModule`, `TasksModule`, `RecurrencesModule` e `AgentModule`. Nenhuma feature deverá importar outra feature diretamente; dependências reutilizáveis serão expostas pelo core.

## Testes e validação

- Atualizar imports, fixtures e entrypoints dos testes existentes depois de cada movimento.
- Preservar testes unitários, integração PostgreSQL, rotas HTTP, autenticação e WebSocket.
- Validar que todas as rotas, códigos HTTP, contratos de `@repo/contracts` e frames do chat permanecem iguais, salvo remoção explicitamente aprovada de contrato sem consumidor.
- Executar análise de referências para arquivos, exports, rotas, providers, componentes, hooks, assets, scripts e dependências antes e depois da limpeza.
- Executar `typecheck`, lint, build e a suíte completa de testes de todos os workspaces relevantes, não somente da API.
- Testar o `web` pelos fluxos reais de sessão, agenda, evento, voz e chat; protótipos locais não substituem esses testes.
- Adicionar teste arquitetural garantindo:
  - nenhuma feature agregadora antiga;
  - nenhum controller com múltiplas operações;
  - nenhuma feature importando outra feature;
  - identidade e WebSocket fora de `features`;
  - notas e catálogo sem feature HTTP artificial.
- Adicionar uma verificação de código morto que falhe quando houver:
  - arquivo sem entrypoint ou referência válida;
  - export sem consumidor;
  - dependência sem import;
  - rota/controller sem wiring ou contrato conhecido;
  - componente, hook, estilo ou asset fora dos fluxos de produção/teste;
  - mock, preview ou implementação duplicada incluída no build de produção.
- Não criar migrations nem alterar tabelas.

## Critérios de conclusão

- A nova estrutura está aplicada de forma consistente em todos os apps e packages envolvidos.
- Cada arquivo restante possui um consumidor, entrypoint, teste ou função explícita de infraestrutura.
- O `web` não depende de diretórios de mockup para executar o produto.
- Não existem fluxos de criação, tarefas, notas ou chat que apenas simulem persistência em estado local.
- Não existem funções exportadas, rotas, dependências ou assets órfãos conhecidos.
- O comportamento externo preservado passa pelos testes HTTP, WebSocket, autenticação e integração PostgreSQL.
- O plano de remoção registra o que foi excluído e a evidência de que não havia consumidor válido.

## Assumptions

- A regra será a mesma de auth: uma feature por operação pública.
- A refatoração é estrutural e não altera comportamento das capacidades mantidas.
- O contrato externo HTTP/WebSocket permanece compatível.
- Alterações já existentes no worktree serão preservadas.
