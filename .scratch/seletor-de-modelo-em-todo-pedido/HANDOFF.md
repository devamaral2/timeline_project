# Seletor de modelo sempre no campo: continuação

Escrito em 2026-11-22 para a tarefa seguir em outro chat e atualizado em 2026-11-23, quando o código foi dado por
terminado nas três frentes. Tudo abaixo descreve o que está **no disco, sem commit**, na branch
`feat/android-reconstruido` (HEAD `3916869f`), no checkout principal
`/home/rafaelamaral/Documents/projects/timeline_project`.

**Estado em 2026-11-23:** contrato, API, web e Android prontos, com testes e lint passando. Falta só o que depende do
usuário: o teste real com os provedores (gasta créditos), a conferência no navegador com sessão de verdade, as
decisões listadas no fim e o commit.

## O pedido

> Refatore os inputs de quando abrimos um novo chat com IA e também o input de update nos detalhes de entidade para
> sempre exibirem as informações do modelo e do provider e sempre deve ser possível clicar na escolha do modelo para
> alterar isso.

A referência visual é o campo do modo modelo que já existia: no pé do campo, as barras do esforço,
"Haiku 5.5 · Médio" e `via anthropic`; tocar abre a gaveta (Provedor, Modelo, Esforço, "Selecionar").

## O que o usuário decidiu

Perguntei o que a escolha deveria controlar, porque antes ela só valia no modo `/modelo`. Resposta:
**"Vale em todo pedido"**. O chat padrão e a edição do detalhe enviam a escolha, e os agentes do servidor (consulta,
escrita, edição) rodam no provedor, modelo e esforço escolhidos.

Depois o usuário mandou parar o subagente que fazia o Android em segundo plano e pediu este arquivo. Em 2026-11-23
ele mandou terminar a tarefa, o que incluiu o Android.

## Estado por área

| Área | Estado | Verificação |
|---|---|---|
| Contrato (`packages/contracts`) | Pronto | `dist` reconstruído |
| API (`apps/api`) | Pronto | `tsc` limpo; suíte da API inteira: 85 arquivos, 1123 testes passando |
| Web (`apps/web`) | Pronto | `tsc` limpo fora de `.next/types` (lixo antigo); suíte web + `corpos` + `contracts`: 104 arquivos, 950 testes passando; conferido no navegador |
| Android (`apps/mobile`) | Pronto | `pnpm --filter @repo/mobile run test`: 65 suítes, 630 testes, nenhuma falha; `pnpm --filter @repo/mobile run lint` (ktlint + lint do Android): passou. Sem emulador: não foi visto rodando |
| `docs/mobile-parity.md` | Atualizado | Linha "Seletor de modelo sempre no campo, e a escolha em todo pedido", em "Chat" |
| Chamadas reais aos provedores | Não feitas | Só clientes falsos nos testes |

## Contrato

`packages/contracts/src/agent/request.dto.ts`: `StartRequestInput` e `StartEditRequestInput` ganharam
`model?: ModelSelection` (`{ provider, model, effort }`). O comentário de `RequestDto.model` mudou: agora é a escolha
do pedido em qualquer rota que use modelo.

A API e o web resolvem `@repo/contracts` por `dist/`: depois de mexer no pacote, rode
`pnpm --filter @repo/contracts build`. O Vitest resolve pelo fonte e não precisa disso.

## API

Comportamento:

- `POST /api/requests` e `POST /api/requests/edit` aceitam `model` opcional. Provedor sem chave ou modelo fora da lista
  responde 400 (`selectionProblem`, a mesma conferência de `POST /api/requests/model`).
- A escolha fica no pedido (`tasks.data.model`, que o store já gravava) e todo agente dos passos roda com ela: consulta,
  escrita (`entity`, nas duas rodadas), edição do detalhe (`askTarget`) e a explicação de falha.
- Sem `model`, nada muda: vale o modelo fixo do servidor (`OPENROUTER_PROCESS_MODEL`).
- No despacho, a rota `config` (que entrega o pedido ao modo modelo) usa a escolha do pedido no lugar do padrão, mas só
  se o modo modelo vale para o usuário (`configModelFor`).
- `GET /api/requests/:id` não devolve `model` quando a rota virou `hermes`: quem respondeu foi o modelo do Hermes.
- A estimativa de alimento (`OpenRouterFoodParsingGateway`) continua no modelo próprio dela.

Como foi feito:

- `StructuredCompletionInput.model?` e `SelectedModelCompletionGateway` em
  `apps/api/src/api-core/agent/gateways/structured-completion.gateway.ts`: sem escolha chama o gateway fixo; com ela, o
  do provedor; provedor sem chave lança `LlmUnavailableError`.
- OpenRouter: o mesmo gateway, com o modelo e o esforço da escolha (`max` vira `xhigh`), o schema também por escrito
  no prompt e leitura tolerante do JSON (`jsonReply`).
- Anthropic: `apps/api/src/infrastructure/model-agent/anthropic-structured.gateway.ts`, pelo SDK
  (`client.beta.messages.create`), raciocínio adaptativo com resumo, `output_config.effort`, fallback do servidor menos
  no Haiku. **O schema vai escrito no prompt, não em `output_config.format`**: a saída presa ao schema aceita no máximo
  16 campos com união de tipos por pedido, e os schemas dos agentes (`request-agent-schemas.ts`) têm dezenas de campos
  `nullable`. Quem valida é o runner, com Zod.
- OpenAI: `openai-structured.gateway.ts`, Responses API, `text.format` `json_schema` com `strict: false`,
  `store: false`, e a mesma repetição sem o resumo do raciocínio quando a organização não é verificada.
- `RequestAgentRunner`: com `model`, a chamada pensa no esforço da escolha (com ou sem `think`), numa tentativa só, e o
  orçamento do agente é multiplicado por esforço (baixo 3, médio 4, alto 6, máximo 9) com teto de 75 s por chamada,
  porque um passo faz até duas chamadas e o cliente desiste aos 180 s. **Esses números são chute meu, sem medição.**

Arquivos novos: `anthropic-structured.gateway.ts`, `openai-structured.gateway.ts` (e os `.test.ts` deles),
`api-core/requests/request-model-selection.test.ts`, `features/start-request/start-request.controller.test.ts`.

Arquivos que estavam limpos e eu alterei: `structured-completion.gateway.ts` (+ teste),
`request-agent-runner.test.ts`, `request-query-worker.ts`, `request-target-edit.ts`, `request-view.ts`,
`features/start-request/start-request.controller.ts`, `features/start-edit-request/start-edit-request.controller.ts`
(+ teste), `infrastructure/model-agent/anthropic-provider.ts` e `openai-provider.ts` (só `export` em constantes e
funções reaproveitadas).

Arquivos que **já tinham mudanças não commitadas de outra sessão** e em que eu também mexi: `request-agent-runner.ts`,
`request-dispatcher.ts` (+ teste), `request-operations.ts` (+ teste), `request-providers.ts`, `request-store.ts`
(comentários), `request-finalizer.ts`, `request-entity-worker.ts` (arquivo novo da outra sessão; uma linha).

## Web

Comportamento:

- O seletor aparece sempre que o servidor oferece opções: no chat novo (assistente da agenda), no modo modelo e no campo
  de edição do detalhe (`EntityAiEditBar`, tarefa e documento). Some só no modo `/hermes`. "Nova conversa" não o tira.
- Sem provedor com chave (`GET /api/requests/model/options` responde 404) o campo fica como era, sem o pé, e o pedido
  vai sem `model`.
- Uma escolha só para a página, guardada em `localStorage` (`braid.model-selection`, a chave que já existia): trocar
  num campo muda o outro.
- O pedido do assistente (`POST /api/requests`) e o de edição (`POST /api/requests/edit`) levam `model`. Um envio feito
  antes de as opções chegarem espera por elas.
- No detalhe, o botão do seletor continua clicável com um pedido em andamento (a troca vale no próximo). Aberto, o
  campo cresce para cima: no celular a barra já é fixa no pé; no desktop ela vira `sticky` enquanto está aberta e
  durante os 280 ms em que recolhe (`data-model-lifted`). O fundo escurece a tela inteira.
- As opções são relidas, por trás, cada vez que um campo aparece e em "Nova conversa". O 404 fica lembrado até a
  próxima releitura; falha de rede não é lembrada nem apaga o que já foi lido.

Arquivos novos:

- `apps/web/src/lib/agent-chat/model-selection-store.ts`: o estado único (opções + escolha), `useModelSelection`,
  `modelSelectionForRequest`, `loadModelOptions`, `resetModelSelectionStore` (testes).
- `apps/web/src/components/ui/hermes-composer.tsx`: o cartão do campo, um só para o chat e para o detalhe (painel,
  contexto, texto, pé com o seletor).

Arquivos alterados: `components/hub/model-picker.tsx` (`useModelPicker`, `ModelPickerScrim`),
`model-picker.module.css`, `components/hub/agent-chat-panel.tsx`, `components/detail/EntityAiEditBar.tsx`,
`components/detail/entity-ai-edit-bar.module.css`, `lib/agent-chat/use-agent-chat.ts`,
`lib/entity-edit/use-entity-ai-edit.ts`, `test/fake-api/requests.ts`, `test/setup.ts` e os testes
(`model-picker.test.tsx`, `EntityAiEditBar.test.tsx`, `agent-chat-panel-listen.test.tsx`,
`use-agent-chat-model.test.ts`, `use-agent-chat-process.test.ts`). `components/shell/shell.module.css` já tinha
mudanças de outra sessão; tirei dele as regras de `form[data-model]`, que foram para a folha do campo.

Pegadinha dos testes: `test/setup.ts` zera o estado da escolha depois de cada teste com `import()` dinâmico. Um
`import` estático ali carrega `@/lib/api/*` antes dos `vi.mock` de cada arquivo e quebra dezenas de testes.

## Android

O subagente foi parado enquanto escrevia testes, mas o código e os testes ficaram completos no disco. Em 2026-11-23
rodei os testes e o lint do mobile sobre esse estado, sem precisar corrigir nada. O que existe:

- Novo `domain/chat/ModelSelector.kt` (`@Singleton`, o equivalente do `model-selection-store` do web) e
  `ModelSelectorTest.kt` (8 testes).
- `ChatViewModel.kt` e `ChatState.kt` usam o `ModelSelector`; `ChatUiState.picker` esconde o seletor no modo Hermes (e
  é `null` sem as opções do servidor); o pedido por passos manda `models.selectionForRequest()`.
- `EntityEditViewModel.kt` expõe `picker`, relê as opções ao aparecer e manda a escolha em `startEdit`.
- `EntityEditBar.kt` e `AiEditBar.kt` desenham o seletor, o painel, o fundo (`ModelScrim`) e fecham com o voltar.
- `RequestDtos.kt`, `ChatRepository.kt`, `DefaultChatRepository.kt`, `AgentRequest.kt`,
  `DefaultAgentRequestRepository.kt`: `model` nos dois corpos.
- Testes alterados: `EntityEditViewModelTest.kt` (6 novos), `ChatViewModelTest.kt`, `ChatVoiceTest.kt`.

Os testes cobrem: ler as opções ao abrir o chat e ao aparecer a barra; o pedido do assistente e o de edição com a
escolha; campo simples e pedido sem `model` com o modo desligado; envio antes de as opções chegarem; `/hermes` sem
seletor; troca feita numa tela valendo na outra; "Nova conversa" mantendo o seletor.

O que continua sem resposta:

- O que ele mudou em arquivos que já tinham mudanças de outra sessão (`ChatScreen.kt`, `AiEditBar.kt`,
  `ChatFixturesTest.kt`): o `git status` não separa. Importa na hora de montar o commit.
- Como fica na tela: o app não foi aberto em emulador nem em aparelho, então o painel e o fundo escurecido no detalhe
  só foram conferidos pelo código e pelos testes de ViewModel.
- Quem escreveu a linha do `docs/mobile-parity.md`: ela apareceu às 22:04 de 2026-11-22, depois de o subagente parar
  e fora desta sessão. Conferi o texto contra o código e ele está certo.

Os 15 arquivos que eram limpos ou não existiam antes dele, e que dá para reverter sem tocar no trabalho de outra
sessão: `ModelSelector.kt`, `ModelSelectorTest.kt`, `DefaultChatRepository.kt`, `DefaultAgentRequestRepository.kt`,
`RequestDtos.kt`, `ChatRepository.kt`, `AgentRequest.kt`, `EntityEditBar.kt`, `EntityEditViewModel.kt`,
`ChatState.kt`, `ChatViewModel.kt`, `ModelPicker.kt`, `EntityEditViewModelTest.kt`, `ChatViewModelTest.kt`,
`ChatVoiceTest.kt`. Reverter só esses deixa `AiEditBar.kt` e `ChatScreen.kt` apontando para coisas que somem: confira
os dois à mão.

### O que o Android faz (o mesmo que o web)

1. Ler as opções e conferir a escolha guardada assim que o chat abre e assim que a barra de edição aparece, não só no
   `/modelo`. 404 ou outra falha: campo simples, pedido sem `model`, tenta de novo na próxima abertura.
2. Chat: seletor no pé do campo no assistente da agenda e no modo modelo; escondido só no `/hermes`; "Nova conversa"
   não o tira.
3. No assistente, cada mensagem vai a `POST /api/requests` com `model`. Modo modelo e Hermes não mudam. O "Pedir ao
   Hermes" do seletor de entidades (`EntityPickerController.kt`) segue **sem** `model`.
4. Barra de edição da entidade (`EntityEditViewModel`): mesmo seletor e mesmo painel, `POST /api/requests/edit` com
   `model`; o botão segue tocável com pedido em andamento.
5. Painel aberto no detalhe escurece o fundo; tocar fora ou o voltar do sistema fecha.
6. Fora do escopo: o campo da tarefa de agente (`AgentTaskScreen.kt`) e a barra do arquivo do Hermes
   (`AgentFileViewModel`) ficam sem seletor.

## O que falta, em ordem

Feito em 2026-11-23: Android verificado (testes e lint) e `docs/mobile-parity.md` com a linha nova. As suítes web
(950 testes) e API (1123 testes) foram rodadas de novo e passam.

Falta, e tudo depende do usuário:

1. Teste real com os provedores, **só com o OK do usuário, porque gasta créditos**: no assistente, uma consulta
   ("o que tenho amanhã?") e uma escrita com um modelo da Anthropic; o mesmo com a OpenAI e com um modelo do
   OpenRouter; uma edição no detalhe. É o único jeito de saber se o JSON por escrito funciona com cada modelo e se os
   orçamentos de tempo bastam.
2. Conferir no navegador com sessão de verdade. O painel do navegador estava na tela de login e a senha do admin vem
   do 1Password, então conferi por uma página de mockup temporária com o `fetch` das opções trocado (já apagada).
   Faltou ver o detalhe real de uma tarefa e de um documento, e uma conversa de verdade.
3. Ver o Android num aparelho ou emulador, lado a lado com o web.
4. Commit só quando o usuário pedir. A árvore tem trabalho de outras sessões misturado (API, mobile, auth, docs,
   ops), inclusive dentro de arquivos desta tarefa: monte o commit arquivo por arquivo com as listas acima, nunca com
   `git add -A`.

## Decisões que tomei sozinho e o usuário ainda não confirmou

- O seletor some no modo `/hermes`.
- Os outros dois campos do Hermes (pedido da tarefa de agente e arquivo do Hermes) ficaram sem seletor. No web o
  primeiro usa `startRequest`, então pôr o seletor ali é pequeno (`AgentRequestBar.tsx` + `HermesComposer`).
- Quem nunca escolheu um modelo passa a usar o padrão do servidor em todo pedido: o primeiro provedor com chave e o
  modelo padrão dele (Opus 5.5, esforço médio, se houver chave da Anthropic). É mais lento e mais caro que o modelo
  fixo de antes. Não há opção "padrão do servidor" no seletor.
- A caixa de processo do chat não mostra o modelo que rodou os passos; só as respostas da rota `model` têm o rodapé.
- Não escrevi ADR. O item 2 do ADR 0019 ainda diz que o seletor só existe no modo modelo. Se for escrever, o número
  livre é 0021: já existe um `docs/adr/0020-...md` não commitado, de outra sessão.

## Cuidados com a máquina e com a árvore

- Não reverta nem "limpe" arquivos fora das listas acima: há dezenas de mudanças não commitadas de outras sessões.
- Uma suíte por vez e com poucos workers:
  `pnpm exec vitest run --workspace vitest.workspace.ts --project <web|api> --maxWorkers=3 --minWorkers=1`. Duas suítes
  inteiras em paralelo, ou uma suíte junto com o Gradle, esgotam a memória.
- Os servidores de dev do usuário estavam no ar em 3000 (web), 3001 (API) e 3002 (auth). Não os reinicie.
- Há daemons do Gradle antigos de outras sessões; não os mate.
- Segredos só pelo 1Password: não ponha chaves em `.env.local`.
