---
status: accepted
date: 2026-11-19
---

# O modo modelo no chat

O chat ganha um segundo agente de modo, ao lado do Hermes (ADR 004, `.agents/docs/ai-dialog/adr-004-hermes-automacoes.md`):
o modo modelo. As mensagens vão direto a um modelo que o dono escolhe — provedor (Anthropic, OpenAI ou OpenRouter),
modelo e esforço — até `/app`, e o modelo usa a agenda com as mesmas ferramentas que o Hermes usa.

## Contexto

O chat tem a rota por passos (agentes da agenda pelo OpenRouter) e o Hermes, um agente de terceiros com memória e as
ferramentas do nosso MCP (`apps/mcp`), alcançado pelo `/hermes` e como fallback (ADR 0018). O dono assina o Claude Max,
que inclui créditos mensais da API da Anthropic, e pediu para usar o Claude no chat; depois, para poder usar também a
OpenAI e o OpenRouter, escolhendo provedor, modelo e esforço a cada pedido. O seletor segue o quadro "B · Gaveta" do
canvas "Provedor, modelo e esforço".

## Decisão

1. **Um modo, como o do Hermes.** `/modelo` liga o modo com a última escolha; `/claude`, `/openai` e `/openrouter`
   ligam já com aquele provedor. Qualquer um aceita a mensagem junto (`/claude o que tenho amanhã?`). `/app` volta ao
   assistente da agenda; "Nova conversa" também volta. A web e o Android leem os mesmos comandos.
2. **O seletor mora no campo de digitar.** No modo, o rodapé do campo mostra o esforço em barras, "Modelo · Esforço" e
   `via <provedor>`. Tocar abre a gaveta que cresce do próprio campo: provedor, modelo, os quatro níveis de esforço
   (Baixo, Médio, Alto, Máximo) e "Selecionar". Sem títulos nem explicações. A escolha fica no aparelho e vai em cada
   pedido; cada resposta mostra embaixo o modelo, o esforço e o provedor que a deram.
3. **Uma rota e um job.** `GET /api/requests/model/options` diz os provedores com chave neste ambiente, os modelos de
   cada um e a escolha padrão (na Anthropic, o Haiku: quem instala o app de novo e ainda não escolheu modelo começa
   nele). `POST /api/requests/model` (o corpo do Hermes mais `model: {provider, model, effort}`)
   abre um pedido de rota `model`, guarda a escolha em `tasks.data.model` e põe o turno na fila (`model-turn`, ADR
   0013). O cliente acompanha em `GET /api/requests/:id`; pensamentos e ferramentas vêm do rastro, e a resposta em
   `message`. Sem nenhuma chave, as duas rotas respondem 404 e o chat avisa que o modo está desligado.
4. **A lista de modelos é do servidor.** Na Anthropic e na OpenAI ela é fechada, em `model-catalog.ts`. No OpenRouter
   ela vem da API pública dele (`/api/v1/models`): todo modelo que aceita ferramentas, sem as variantes `:batch`, em
   ordem alfabética, guardada por uma hora; fora do ar, vale uma lista curta curada, por um minuto. O pedido com um
   modelo fora da lista do provedor, ou de um provedor sem chave, recebe 400. Com mais de seis modelos, o painel
   ganha a busca "Buscar modelo" (nome ou id, sem acento e sem caixa) e a lista rola por dentro.
5. **Um loop, três provedores.** O `ModelAgent` roda o turno igual para todos — abrir o MCP, chamar o modelo, rodar as
   ferramentas pedidas, devolver os resultados, até a resposta — e cada provedor só traduz a conversa:
   - **Anthropic**, pelo SDK oficial com `ANTHROPIC_API_KEY`: raciocínio adaptativo com resumo, cache do prompt e o
     fallback do servidor na recusa por política (menos no Haiku, que não tem).
   - **OpenAI**, pela Responses API com `OPENAI_API_KEY` (a única em que os GPT-6 usam ferramentas), sem guardar nada
     na OpenAI (`store: false`): o raciocínio cifrado volta na ida seguinte. O resumo do raciocínio pode exigir a
     organização verificada; recusado, o turno segue sem ele.
   - **OpenRouter**, pela API compatível com a da OpenAI e a mesma `OPENROUTER_API_KEY` da rota por passos, devolvendo
     o raciocínio (`reasoning_details`) na ida seguinte.
   O esforço Máximo vira `max` na Anthropic e na OpenAI e `xhigh` no OpenRouter.
6. **As ferramentas da agenda são as do MCP.** A API abre uma conexão com o `apps/mcp` por turno (`MCP_URL`,
   `MCP_TOKEN`). Criar, ler e editar tarefas, documentos e recorrências; nada apaga (ADR 004, item 11). Sem o token do
   MCP ou sem o dono, o modelo só conversa e o prompt diz isso.
7. **Só o dono, enquanto as ferramentas estão ligadas.** O MCP age sempre como `MCP_OWNER_USER_ID`; por isso a rota
   recusa (403) quem não é esse usuário.
8. **A conversa vai junto, só o texto.** Nenhum provedor guarda a conversa: o turno leva as últimas 20 trocas da sessão
   do chat (a pergunta e a resposta de cada pedido, em qualquer modo e com qualquer modelo). A data, a hora e o fuso
   entram junto da mensagem, fora do prompt fixo, para o cache do prompt valer entre os turnos.
9. **Repetição só antes de agir.** O SDK repete 429 e 5xx; depois, a fila repete o turno enquanto nenhuma ferramenta de
   escrita rodou. Depois de uma criação ou edição, toda falha é definitiva, como no Hermes (ADR 004, item 14).
10. **Produção.** A API alcança o MCP pelo serviço interno (`MCP_URL` no Deployment) e a NetworkPolicy do MCP passa a
    aceitar o pod da API além do Hermes.

## Alternativas rejeitadas

- **Um modo por provedor (`/claude`, `/gpt`…), cada um com a própria rota.** Três rotas iguais, e trocar de modelo no
  meio da conversa viraria trocar de modo. Os comandos por provedor ficaram só como atalhos do mesmo modo.
- **Tudo pelo OpenRouter.** Uma chave só, mas perde recursos de cada API (resumo do raciocínio e cache da Anthropic, o
  raciocínio cifrado da OpenAI) e não usa os créditos do Max.
- **A assinatura Pro/Max pelo Claude Agent SDK.** Os termos da Anthropic pedem chave de API para apps feitos com o
  Agent SDK; usar o login da assinatura arrisca a conta.
- **O conector MCP das próprias APIs.** Exige o MCP alcançável pela internet; o nosso só existe na rede interna (ADR
  004, item 10).
- **Ferramentas próprias dentro da API.** Repetiria as do MCP, que já têm idempotência, revisão e o limite de não
  apagar.

## Consequências

- Cada mensagem no modo custa tokens da conta do provedor escolhido (na Anthropic, os créditos do Max e, passado o
  limite, cobrança por uso). O rastro de cada pedido mostra provedor, modelo, esforço, chamadas e tokens.
- O modelo pode criar e editar entidades do dono como o Hermes: o risco aceito na ADR 004 (um agente enganado
  sobrescrever campos) vale também aqui, com qualquer modelo da lista.
- Atualizar os modelos da Anthropic e da OpenAI é editar `apps/api/src/api-core/requests/model-catalog.ts`; um modelo
  aposentado falha o turno até sair da lista. Os do OpenRouter se atualizam sozinhos.
- Nas worktrees, o MCP age como o `MCP_OWNER_USER_ID` do 1Password, que não é o admin da base da worktree; ali o modo
  com ferramentas responde 403 até o dono da worktree ser o do MCP.
- A NetworkPolicy mantém o nome `mcp-from-hermes-only` para o `kubectl apply` atualizar a política existente.
