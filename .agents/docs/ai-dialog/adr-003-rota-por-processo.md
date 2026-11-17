# ADR 003 — Rota de IA por processo: JEV despacha, filas trabalham, finalização vincula

Status: **fases A, B, C e D implementadas** atrás de `AI_PROCESS=on` (desligada por padrão). Plano completo: ver "Fases".

## Contexto

O diálogo com a IA tem dois caminhos (ADR 001 e ADR 002): o legado, com loop de ferramentas, e o pipeline rápido, com planejador e especialistas num só job. Ambos tratam o pedido como uma lista de operações resolvida num único job e num único commit, e o especialista de refeição ainda cria a nota junto com o evento.

Um pedido pode envolver várias entidades de tipos diferentes ("comendo arroz e feijão, depois vou nadar e depois volto para casa"). Cada entidade subsiste sozinha; o que as une é o vínculo (nota → evento, nota → tarefa, tarefa → evento), que só pode ser decidido quando as entidades já existem.

## Decisão

Uma rota própria, `POST /api/ai/process` (e `GET /api/ai/process/:id`), com este fluxo:

1. **Processo primeiro.** O pedido grava `ai_processes` e enfileira `process-dispatch`. O processo fica ligado a cada entidade criada ou editada (`ai_process_entities`).
2. **JEV de entrada** (`process/jev/dispatch.json`): uma chamada com uma pergunta por operação × entidade (`none | one | many`), mais `query`. Cada resposta diferente de "nenhum" cria um passo (`ai_process_steps`) e um job na **fila própria** daquele agente (`process-event-create`, `process-task-create`, `process-note-create`...), todos de uma vez. Resposta incerta, JEV indisponível ou nenhum passo reconhecido vão para `process-fallback`. Não existe flag "complexo".
3. **Agentes por passo** (`process/agents/*.md`, um por tarefa): uma chamada estruturada em JSON, sem loop de ferramentas, modelo rápido, raciocínio desligado. Cada passo grava a sua entidade num commit próprio e, **na mesma transação** (`EntityBatch.afterWrite`), registra o passo concluído e enfileira `process-finalize`.
4. **Fila de finalização com lock por processo.** Cada passo concluído entra nela. O finalizador compara cada entidade nova com as já criadas do mesmo processo, pelo JEV (`process/jev/link.json`, uma pergunta `Choice` com candidatos + "nenhum"), nos dois sentidos permitidos, e vincula quando o JEV está certo (> 0,92). Não espera os outros passos. O processo fecha quando todos os passos terminaram e todas as entidades foram finalizadas.
5. **Resposta predefinida.** A caixa de processo mostra "Realizando processos:" e a lista de passos, com check verde ou vermelho. Nenhum texto de sucesso passa por modelo (`process/ui.json`).

### Regras dos agentes

- Sempre JSON, o mais rápido possível; passo que estoura o tempo fica vermelho e não é refeito.
- **Nunca perguntam** nada que tenha valor padrão; os schemas de saída não têm campo de esclarecimento. O que o usuário não disse vem `null` e o servidor aplica o padrão.
- Agentes de criação **não consultam o banco**. Agentes de edição recebem do JEV as entidades possivelmente editadas (candidatos) e, se nenhuma servir, pedem **uma** consulta de leitura e são chamados de novo com o resultado (no máximo uma rodada extra). Só aceitam ids que vieram dos candidatos ou da consulta.
- Agentes que criam eventos **nunca criam notas**: um evento de refeição só recebe o nome. A nota de refeição vem da fila de notas e é vinculada pela finalização. Para isso `CreateEventUseCase.prepare` ganhou `derivedNotes: false`, e `AgentChangeSession.keepUnlinkedMeals()` impede descartar a nota de refeição ainda sem evento.
- **Nenhum agente corrige sobreposição de eventos.** Evento criado ou editado sobre outro é gravado como está.
- Os agentes novos não reaproveitam parâmetros, prompts nem especialistas dos anteriores; reaproveitam só infraestrutura (filas, escritor em lote, sessão de mudanças, gateway estruturado).

### Recorrências (fase C)

Quatro agentes (`recurring-event-create`, `recurring-task-create`, `recurring-event-edit`, `recurring-task-edit`) com schemas próprios sobre a regra do domínio (`RecurrenceRule`), não sobre os parâmetros das skills anteriores. O servidor aplica os padrões que o usuário não é perguntado: intervalo 1, dia da semana ou do mês de `startsOn`, início hoje, **09:00 quando não há horário**. O template de uma série de eventos **nunca traz notas** (`derivedNotes: false` atravessa `prepareRecurrence` e `reviseRecurrence`): uma série de refeição fixa não gera nota. Editar uma série vale de hoje em diante e preserva as notas dela; alterar **uma** ocorrência isolada é uma edição de evento comum (`event-edit`), e o JEV de entrada recebe essa distinção nas perguntas. Os candidatos de edição de série são as recorrências do usuário, com a cadência em texto. A primeira ocorrência da série entra no lote e aparece na caixa de processo, mas **não é vinculada** a notas ou tarefas na finalização: o vínculo valeria para um dia só.

### Fallback que orquestra e explicação de falha (fase C)

> **Substituído pela [ADR 0018](../../../docs/adr/0018-hermes-como-fallback-do-pedido-por-passos.md):** o fallback agora é o Hermes; o agente `fallback`, o laço e o foco saíram. A explicação de falha continua como abaixo.

O agente de `process-fallback` ou responde (pedido sem relação com os dados) ou devolve até 6 chamadas `{agent, instruction}` a especialistas. O servidor cria esses passos pelo mesmo mecanismo do despacho (`ProcessStore.handOff`), na mesma transação em que o passo do fallback termina, de modo que o processo não fecha no meio. O schema do fallback não aceita `fallback` como especialista. Cada especialista chamado recebe o pedido inteiro mais o **foco** do orquestrador; passos de edição chamados assim nascem sem candidatos escolhidos pelo JEV e usam a consulta do próprio agente. Quando o processo termina com algum passo vermelho, o `failure-explainer` faz **uma** chamada curta (nomes de passos e códigos de erro, nunca o texto do usuário em log) e a frase vai em `response.explanation`; se ela falha, vale a linha predefinida de `ui.json`. Sucesso total nunca chama modelo para texto.

### Clientes (fase D)

Contrato compartilhado em `packages/contracts/src/agent/contracts/ai-process.dto.ts` (`AiProcessDto`, com schema Zod em `schemas.ts` e fixture `ai-process.json` para o Android). O cliente do chat tenta `POST /api/ai/process`; o servidor responde **404 enquanto a flag está desligada** (a checagem vem antes de ler o corpo, sem efeito colateral), e é assim que o cliente descobre o caminho: 404 → chat de sempre, e não tenta de novo na sessão. Sem configuração nova no cliente. Com a rota ligada, o cliente acompanha `GET /api/ai/process/:id` a cada segundo e mostra a caixa (`ProcessBox`) na conversa; ao fim, atualiza a agenda se alguma entidade mudou. Decisões e limites: a caixa é **transitória** (não entra no histórico persistido da conversa, que só conhece turnos do agente antigo); **não há cancelamento** depois que os passos foram entregues às filas; a conversa aberta não ganha `conversationId` por esta rota. O recibo durável do chat antigo (outbox) não cobre processos: se a página recarrega no meio, a caixa some, mas o processo termina no servidor.

### Lock da finalização

`PostgresAiJobStore.claim` serializa `process-finalize` por `payload->>'processId'` (advisory lock + `NOT EXISTS` de outro job do mesmo processo em andamento ou mais antigo), do mesmo modo que serializa `agent-turn` por usuário. Processos diferentes finalizam em paralelo. A finalização grava fora do contexto do job (`aiJobContext.exit`): ela pode gravar várias vezes, e quem conclui o job é o consumidor.

### Candidatos de edição (fase B)

O JEV não faz multi-seleção, então o despacho tem duas etapas, a segunda só quando há edição: (1) as perguntas de operação × entidade; (2) o servidor lista os candidatos do(s) tipo(s) pedido(s) (`PostgresProcessCandidateQuery`: eventos de ontem, hoje e amanhã; tarefas em aberto mais recentes; notas mais recentes; tetos 20/20/15) e o JEV responde uma pergunta binária `edit | keep` por candidato (`process/jev/candidates.json`), em paralelo. Cada passo de edição leva no payload os escolhidos do seu tipo. Resposta incerta = não escolhido; falha do JEV ou lista vazia = passo sem candidatos (o agente ainda pode consultar). Isso difere do plano original, que previa as perguntas de candidato na mesma chamada do despacho: assim o pedido de criação, o mais comum, não paga por dezenas de perguntas.

## Consequências

- Cada entidade existe sem as outras; uma falha vira um passo vermelho, não um pedido perdido.
- Mais chamadas por pedido que o pipeline rápido (despacho + um agente por passo + uma por entidade a vincular). O despacho é uma só chamada ao JEV, e a finalização só chama o JEV quando há candidatos.
- Um mesmo candidato pode ser escolhido por várias entidades que chegam depois (uma nota que pertence a dois eventos). Cada decisão é independente.
- Os jobs `process-*` são internos: não aparecem em `/api/ai/jobs`.

## Fases

- **A (feita):** migração `0020`, filas, lock, rota, loader de `.md`/`.json`, dispatcher, finalizador, `event-create`, `task-create`, `note-create`, fallback que responde.
- **B (feita):** `event-edit`, `task-edit`, `note-edit`, `query` (uma única consulta SQL de leitura, linhas guardadas no passo e mostradas na caixa de processo), candidatos de edição escolhidos pelo JEV.
- **C (feita):** quatro agentes de recorrência; fallback que orquestra os especialistas; `failure-explainer` (uma chamada só quando há falha).
- **D (feita):** o chat do web e do app Android consomem a rota e mostram a caixa de processo (paridade em `docs/mobile-parity.md`).

## Referências

- [ADR 001](./adr-001-routing.md), [ADR 002](./adr-002-pipeline-rapido.md)
- `apps/api/src/api-core/process/`
- `apps/api/src/infrastructure/persistence/ai-processes/postgres-ai-process.store.ts`
