# Tickets: o app Android reconstruído a partir do web

Estes 23 tickets dividem a spec [docs/prd/android-reconstruido-do-web.md](../../../docs/prd/android-reconstruido-do-web.md).
Cada ticket cabe numa sessão: leia este arquivo, o ticket e o que ele manda ler, e nada mais é preciso.

## O que vale para todo ticket

- **Fonte.** A spec decide o comportamento; o web decide os detalhes. Antes de portar uma tela, abra o componente web
  correspondente e o web rodando em 390×844: ele é a referência de texto, ordem, estados e erros, não a documentação.
  O glossário está em [CONTEXT.md](../../../CONTEXT.md): use os termos dele (tarefa, tarefa de referência, tarefa
  longa, executor, artefato, pedido, passo, sessão, entrada, subtarefa, tarefa principal) no código em inglês
  (`Task`, `Artifact`, `Request`, `Step`, `Entry`…) e nos textos em português. Artefato se chama "documento" na tela.
- **Skill.** Para qualquer mudança em `apps/mobile`, carregue `.agents/skills/kotlin-android/SKILL.md` (reescrita no
  ticket 01).
- **Não mude a API, o Auth, o web nem `packages/*`.** Se o ticket parecer exigir um dado que a API não entrega, pare e
  relate a lacuna em `docs/mobile-parity.md`, em vez de inventar o dado ou a regra.
- **Fora de escopo:** iOS, aceite de convite, recursos só de desktop, código morto do web (`/buscar` do chat, botão e
  fila de voz não montados, `POST /api/requests/voice`), animações do web, canvases não aplicados no web, troca de
  "Hermes" por "Candeia", cache offline, push do servidor, testes instrumentados de Compose e build de release.
- **Testes.** Uma fronteira só: o ViewModel da tela com a infraestrutura real (Retrofit, OkHttp, `Authenticator`,
  repositório, serialização) contra um `MockWebServer` que serve fixtures geradas dos schemas Zod. O teste confere o
  `UiState` e as requisições recebidas (método, caminho, query, corpo, `revision`, `Idempotency-Key`). Não escreva
  repositórios falsos. Só relógio, alarmes, voz e armazenamento cifrado são trocados, cada um atrás de uma interface
  pequena. Toda lógica portada à mão do TS é conferida contra fixtures geradas pelas funções TS.
- **Concorrência.** Toda criação manda `Idempotency-Key`; toda edição de tarefa de pessoa manda a `revision` lida, e o
  conflito relê a entidade e avisa. Concluir uma tarefa de pessoa envia `finishedAt` com o instante atual; sair de
  `done` envia `finishedAt` nulo.
- **Consulta periódica**, nunca WebSocket: 3 s para pedidos e tarefas de agente abertas (só com a tela visível), 180 s
  de limite para a caixa de processo, 5 min para a fonte dos lembretes.
- **Paridade.** Todo ticket atualiza as linhas das suas telas em `docs/mobile-parity.md`.
- **Comandos**, sempre da raiz: `pnpm --filter @repo/mobile run lint` e `pnpm --filter @repo/mobile run test`
  (exigem JDK 17+ e Android SDK).
- **Pronto** é: todos os critérios marcados, os dois comandos verdes e o app rodado no emulador contra o backend local
  (`pnpm dev:mobile`), lado a lado com o web, com screenshot dos dois no PR.

## Onde o ticket e o web divergem, vale o web

O levantamento do web (2026-11-17) achou pontos em que a spec ou o ticket descrevem algo diferente do que o web faz
na largura mobile. Nesses pontos, siga o web e ignore o critério contrário do ticket:

- **04:** na Agenda, o ponto de status abre o seletor só na tarefa de referência (sem status); tocar no glifo de uma
  tarefa de pessoa com status não faz nada ali.
- **05:** o ponto de filtro ativo ignora a escolha de executor, e "Limpar filtros" não volta o executor ao padrão.
- **11:** na largura mobile não há filtro de tipo nem de tag em Documentos. O alimento em cálculo mostra
  "Preparando informações nutricionais e receita…" e consulta a cada 1,5 s.
- **12:** o chat acompanha o pedido a cada 1 s (os 3 s valem para detalhe e listas).
- **13:** a criação não tem "Tarefa persistente", hierarquia nem documentos (só a edição tem); erro 400 da API mostra
  uma mensagem geral, não por campo.
- **14:** a recorrência tem diária, semanal, mensal e anual, com intervalo, como no editor do web; não só dias da semana.
- **15:** "Criar" no seletor manda também `kind`, `description`, `priority` e `status: "todo"`, como o web.
- **17:** não há botão "Novo documento"; documentos se criam só pelo `/nota` do chat.
- **19:** permissão de microfone negada quando a escuta abriu sozinha ao abrir o chat não mostra aviso.
- **21:** o tema é um interruptor claro/escuro, como no web, com o sistema decidindo até a primeira escolha.
- **23:** o feed tem lido/não lido (marcar como lido e contador), como no web.

## Ordem

Um ticket pode começar quando todos os que o bloqueiam estão feitos. Pode começar já: 01. Depois dele, 02 e 03 andam
em paralelo; depois do 05, Tarefas (07), Documentos (11) e Chat (12, depois do 06) andam em paralelo.

| Ticket | Título | Bloqueado por |
|---|---|---|
| [01](01-apagar-o-app-e-entrar.md) | Apagar o app atual e entrar com e-mail e senha | — |
| [02](02-ci-do-mobile.md) | CI do mobile de volta | 01 |
| [03](03-agenda-do-dia-e-barra-inferior.md) | Agenda do dia com a barra inferior | 01 |
| [04](04-status-pela-agenda.md) | Mudar o status pela agenda | 03 |
| [05](05-menu-da-secao-e-filtro-de-executor.md) | Menu da seção e filtro de executor | 03 |
| [06](06-agenda-em-sequencia-e-tempo-livre.md) | Agenda em sequência e tempo livre | 05 |
| [07](07-lista-de-tarefas-por-status.md) | Lista de Tarefas por status | 04, 05 |
| [08](08-gaveta-de-subtarefas.md) | Gaveta de subtarefas | 07 |
| [09](09-detalhe-da-tarefa-de-pessoa.md) | Detalhe da tarefa de pessoa | 04 |
| [10](10-detalhe-da-tarefa-de-agente.md) | Detalhe da tarefa de agente | 09 |
| [11](11-lista-e-leitura-de-documentos.md) | Lista e leitura de Documentos | 05 |
| [12](12-chat-com-pedido-e-caixa-de-processo.md) | Chat com pedido e caixa de processo | 05, 06 |
| [13](13-criar-e-editar-tarefa.md) | Criar e editar tarefa | 09, 12 |
| [14](14-recorrencia-na-edicao.md) | Recorrência na edição | 13 |
| [15](15-hierarquia-na-edicao.md) | Hierarquia na edição | 13 |
| [16](16-documentos-da-tarefa.md) | Documentos da tarefa | 11, 13 |
| [17](17-nota-e-alimento.md) | Criar, editar e excluir nota; criar alimento | 11, 12 |
| [18](18-arquivos-do-agente.md) | Arquivos do agente | 11 |
| [19](19-voz-no-chat.md) | Voz no chat | 12 |
| [20](20-edicao-por-ia-nos-detalhes.md) | Edição por IA nos detalhes | 09, 11, 19 |
| [21](21-configuracoes-e-sair.md) | Configurações e sair | 12 |
| [22](22-lembretes-como-notificacoes.md) | Lembretes como notificações do Android | 07, 09 |
| [23](23-feed-de-notificacoes.md) | Feed de notificações no chat | 12, 22 |
