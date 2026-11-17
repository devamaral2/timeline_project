# Tickets: tarefa no lugar de evento

Estes 12 tickets dividem a spec [docs/prd/tarefa-no-lugar-de-evento.md](../../../docs/prd/tarefa-no-lugar-de-evento.md).
Cada ticket cabe numa sessão: leia este arquivo, o ticket e o que ele manda ler, e nada mais é preciso.

## O que vale para todo ticket

- **Branch.** Todo ticket parte da branch de integração `refactor/tarefa-no-lugar-de-evento`, criada a partir de
  `feat/web-na-api-nova` já com todo o trabalho do web no banco novo commitado.
- **Fonte.** A spec decide nomes e comportamento. O mapa de termos está na seção "Vocabulário" da spec (e no
  glossário depois do ticket 02): tarefa, tarefa de pessoa, tarefa de agente, tarefa de referência, tarefa longa,
  tarefa recorrente, sequência entre tarefas. Agenda e a tela Tarefas não mudam de nome.
- **Só o nome muda.** Nenhuma mudança de comportamento, de modelo, de tipo (`common`, `meal`…), de status, de
  executor ou de tipo de relação.
- **Nada antigo fica.** Sem alias de tipo, reexportação, rota duplicada, redirect, ferramenta antiga ou permissão
  antiga. Cada ticket troca, de uma vez, quem produz e todos os consumidores daquilo que renomeia.
- **Troca por símbolo, não por texto.** Use rename de símbolo (ts-morph ou IDE) para identificadores. Não toque em
  eventos de DOM e de teclado, em parâmetros `event` de handlers nem em `text/event-stream`.
- **Português no feminino.** Todo texto visível que passa de "evento" a "tarefa" é revisto à mão: artigo, adjetivo e
  particípio ("a tarefa", "Nova tarefa", "Tarefa salva").
- **Varredura de resíduos.** Depois do ticket 03, o teste de varredura tem uma linha de base de resíduos por área.
  Todo ticket remove da linha de base a área que limpou; a linha de base nunca cresce.
- **Histórico.** Não edite migrations já aplicadas nem ADRs antigas.
- **Fora de escopo:** o app Android (só a nota em `docs/mobile-parity.md`, no ticket 12) e a troca de "Hermes" por
  "Candeia" nos textos.
- **Comandos**, sempre da raiz: `pnpm run test:unit` e `pnpm run typecheck`; os de integração quando o ticket mexe
  no banco. Rode uma suíte unitária por vez. Os testes de contrato do mobile são rodados quando os contratos mudam,
  mas continuam quebrados até o porte do Android; não os conserte.
- **Pronto** é: todos os critérios marcados, os comandos verdes e a linha de base da varredura menor ou igual.

## Ordem

Podem começar já: 01, 02 e 03. Depois, dois caminhos andam em paralelo: banco e agentes (04 → 09) e contrato, rotas e
web (06 → 07 → 10 → 11). O 12 fecha.

| Ticket | Título | Bloqueado por |
|---|---|---|
| [01](01-liberar-nome-task-no-web.md) | Liberar o nome Task no web | — |
| [02](02-glossario-adr-e-instrucoes.md) | Glossário, ADR 0015 e instruções | — |
| [03](03-varredura-de-residuos.md) | Varredura de resíduos com linha de base | — |
| [04](04-banco-da-api-renomeado.md) | Banco da API renomeado no lugar | 03 |
| [05](05-permissao-de-tarefa-no-auth.md) | Permissão de tarefa no Auth | 03 |
| [06](06-contrato-de-tarefa.md) | Contrato de tarefa | 01, 03 |
| [07](07-rotas-api-tasks.md) | Rotas `/api/tasks` | 05, 06 |
| [08](08-codigo-interno-da-api.md) | Código interno da API com nome de tarefa | 04, 07 |
| [09](09-agentes-falam-de-tarefa.md) | Agentes falam de tarefa | 04, 06 |
| [10](10-codigo-interno-do-web.md) | Código interno do web com nome de tarefa | 06 |
| [11](11-telas-e-enderecos-de-tarefa.md) | Telas e endereços de tarefa no web | 07, 10 |
| [12](12-fechamento-e-validacao.md) | Fechamento e validação na worktree | 02, 08, 09, 11 |
