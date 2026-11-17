---
status: accepted
date: 2026-11-16
---

# O Hermes é o fallback do pedido por passos

Substitui o "fallback que orquestra" da ADR 003 (`.agents/docs/ai-dialog/adr-003-rota-por-processo.md`) e muda o
item 3 da ADR 004 (`.agents/docs/ai-dialog/adr-004-hermes-automacoes.md`): o Hermes deixa de receber só automações e
passa a atender também todo pedido do chat que o roteador não encaminha a um agente da agenda.

## Contexto

No pedido por passos, o JEV de entrada escolhe os agentes da agenda (criar, editar, consultar). O que sobrava (nenhum
passo reconhecido, resposta incerta, JEV fora do ar ou o prefixo `fallback:`) ia a um agente nosso, `fallback`, que
respondia ou chamava os especialistas; com `fallback:` ele rodava num laço de até quatro rodadas, o único ponto em
que o modelo pensava. Com isso, o chat tinha dois agentes de propósito geral: esse fallback e o Hermes, que só se
alcançava pelo `/hermes` e já tem memória, sessões e as ferramentas do nosso MCP para ler e alterar a agenda. O dono
do produto pediu que o fallback do chat seja sempre o Hermes.

## Decisão

1. **Todo fallback do pedido por passos vai ao Hermes.** Nos quatro casos acima, o despacho muda a rota do pedido
   para `hermes`, guarda o que o JEV respondeu e põe o turno do Hermes na fila, numa transação só
   (`RequestStore.handToHermes`). Não nasce passo; o pedido segue como se tivesse começado pelo `/hermes`, na mesma
   sessão do Hermes da conversa, e o web troca a caixa de processo pela conversa do Hermes.
2. **`fallback: <pedido>` continua e vai direto ao Hermes**, sem consultar o JEV e sem o prefixo.
3. **Sem o Hermes (`AI_AUTOMATION=off`), o pedido falha na hora** com `unavailable` e um aviso dizendo que o Hermes
   está desligado. Não há agente de reserva.
4. **O agente `fallback`, o laço de rodadas e o "foco" dado aos especialistas saem do código.** Os passos `fallback`
   já gravados continuam legíveis: o rótulo deles fica em `ui.json`.

## Alternativas rejeitadas

- **Hermes quando ligado, o agente `fallback` quando desligado.** Manteria dois comportamentos diferentes para o mesmo
  pedido conforme o ambiente, e o código do laço vivo só para o caso de reserva.
- **Remover o prefixo `fallback:`.** O `/hermes` já fala com o Hermes, mas liga um modo; o prefixo vale para uma
  mensagem só, dentro da conversa da agenda.

## Consequências

- Em ambientes com `AI_AUTOMATION=off` (o padrão do `.env.example`), o chat só atende o que o JEV reconhece; o resto
  falha com o aviso.
- Uma resposta de fallback agora depende do Hermes: mais lenta, com o custo do modelo dele e com as ferramentas do MCP
  (ele pode criar e editar, nunca apagar; ADR 004, item 11). A web atualiza a agenda ao fim de todo pedido do Hermes.
- A resposta de fallback deixa de passar pela finalização: o Hermes não grava passos, então o pedido não liga
  entidades pelo JEV de ligação nem mostra a prévia de cada registro tocado; o rastro é o do Hermes.
- `OPENROUTER_PROCESS_REASONING` não tem mais quem o use: só o laço pedia ao modelo para pensar.
- Jobs `request-fallback` que estiverem na fila no deploy não têm mais handler e deixam o pedido aberto até ser
  cancelado.
- O Android ainda usa a API antiga; `docs/mobile-parity.md` registra a mudança como pendente nele.
