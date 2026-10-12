# Plano de refatoração do diálogo com IA

Status: implementado em `apps/api`, com validação e observações em [`implementation-status.md`](./implementation-status.md). Este documento preserva as decisões e a sequência de implementação.

## Objetivo

Usar o JEV para escolher o menor conjunto de capacidades capaz de atender cada turno de `POST /api/ai` e do chat WebSocket. Preservar autenticação, isolamento por usuário, gravação atômica e os contratos consumidos pelo web e pelo mobile.

## Estado atual

- `RunAgentUseCase` entrega sempre todas as oito skills ao agente do OpenRouter: consulta, quatro eventos, tarefa, nota e remoção.
- O mesmo caso de uso atende REST e chat. O chat inclui histórico carregado no servidor; mudanças e mensagens são gravadas juntas por `EntityBatchWriter`.
- `query_data` executa SELECT com escopo de usuário, mas proíbe parâmetros no SQL escrito pelo modelo e limita a saída a 200 linhas, 500 caracteres por célula e 20 mil caracteres no total.
- `GetDailyOverviewUseCase` materializa recorrências, mas a resposta diária contém apenas resumo de sono, alimentação e treino. Ela não serve para encontrar todos os eventos a atualizar.
- Eventos podem se sobrepor. Um novo evento sem `finishedAt` recebe uma duração estimada: rotina 60 min, alimentação 20 min, treino 90 min e sono 420 min. Revisar um evento recorrente destaca a ocorrência da série.
- A API e o chat publicam `agentResponse: string`. O texto final interno do OpenRouter hoje também é livre. Notas têm `content`, mas ainda não têm título/nome.

## Fluxo proposto

1. Validar identidade, texto e contexto como hoje. Para o roteador, montar estado com pedido atual, contexto de tela, horário local e o mínimo de histórico necessário para resolver referências como “parei agora”.
2. Consultar JEV com perguntas independentes em uma chamada: objetivo (`responder com dados`, `criar/alterar dados`, `responder e criar/alterar`, `outro`), cardinalidade da escrita (`uma`, `várias`, `indefinida`) e alvo único (`rotina`, `alimentação`, `treino`, `sono`, `tarefa`, `outro`). Incluir `outro` para não forçar uma classificação falsa. Uma escrita que consulta o banco apenas para decidir o que mudar continua sendo classificada como escrita; `responder e criar/alterar` significa que o usuário pediu explicitamente uma resposta de consulta além da mudança.
3. Para cada resposta `Choice` do JEV efetivamente usada, exigir simultaneamente `confidence > 0,92` e `probabilities[choice] > 0,92`. Não tomar decisão por uma resposta especulativa de um ramo ignorado. Se qualquer um dos dois valores for `0,92` ou menos, encaminhar ao agente complexo.
4. Selecionar as skills em código, antes de construir o prompt e as ferramentas de leitura do OpenRouter. Skills de escrita ficam disponíveis como contrato JSON para o servidor executar após validação:

   | Caso | Capacidades expostas |
   | --- | --- |
   | Consulta pura, classificação aceita | `query_data` e `get_day_context` |
   | Uma criação ou update em tipo reconhecido, classificação aceita | `save_<tipo>`, `query_data` e `get_day_context` |
   | Múltiplas entidades, consulta e escrita explícitas, nota, exclusão lógica, tipo desconhecido ou baixa certeza | Agente complexo, com skills necessárias ao pedido; inicialmente o conjunto atual |

5. Toda criação ou alteração consulta o banco antes de preparar a mudança. Para eventos, exigir `get_day_context` do dia afetado; para tarefas e notas, usar a consulta pertinente. O agente escritor usa ferramentas de leitura e devolve comandos JSON que referenciam a skill de escrita selecionada. O servidor valida esses comandos com os schemas Zod das skills e os aplica à `AgentChangeSession`. As skills de escrita não são executadas também como tools no mesmo turno, evitando gravação duplicada. Manter revisão otimista e commit único para alterações e turno de chat.
6. Exigir JSON somente da saída interna dos agentes de escrita. A API monta `agentResponse: string` a partir das mudanças validadas, com modelos definidos em código, por exemplo “Foram criados estes eventos:” ou “Criei esta tarefa”. O texto do chat entra no mesmo lote e só é publicado após o commit bem sucedido. Consultas puras continuam produzindo a resposta de consulta. REST e chat preservam o contrato público atual.

## Regras das skills de escrita

- Resposta interna de escrita no envelope JSON `{ "commands": [{ "skill": "save_routine_event", "args": { ... } }] }`, com cada `args` validado pelo mesmo schema usado para criação/alteração. O agente complexo pode devolver vários comandos, inclusive `delete_entity`; cada comando é aplicado uma vez, em ordem, à sessão. Rejeitar campos desconhecidos e valores inválidos; não confiar apenas no prompt.
- Nome curto e substantivo para evento, tarefa e nota: “Estou trabalhando agora e paro às 18h” gera `Trabalho`. Adicionar `name`/título à entidade `Note`, ao banco, DTOs e schemas de criação/update; o agente define o título a partir do conteúdo quando o usuário não o disser.
- Omitir campos opcionais não informados. Usar defaults definidos no domínio; não perguntar por eles. Se faltar campo obrigatório sem default, perguntar no chat sem gravar nada no turno. No REST, que não tem próxima rodada, encerrar sem gravar e informar o campo ausente.
- Pedidos de apagar vão ao agente complexo. A ação de domínio é exclusão lógica: atualização de `deleted_at`, feita pelos repositórios no commit atômico. O agente não escreve SQL de update diretamente.
- Antes de criar ou alterar um evento, chamar `get_day_context` para o dia afetado, mesmo que a intenção pareça ser uma criação nova. Em referência que cruza meia-noite, consultar os dias envolvidos. Um guard de escrita deve recusar `save_*_event` sem essa leitura prévia. Selecionar um ID retornado pela ferramenta; nunca inventar um ID.
- A reorganização de horários deve ser serviço determinístico sobre os eventos carregados, com proposta de alterações validada e gravada no mesmo lote. Quando um evento se estende, ordenar os eventos seguintes por início. Se o próximo começar antes do novo fim do anterior, mover seu início para esse fim e preservar sua duração; repetir em cadeia. Parar na primeira folga em que o próximo início seja igual ou posterior ao fim deslocado. Exemplo aprovado: `Trabalho` 13h–16h estendido até 17h move `Lazer` 16h–17h para 17h–18h; `Ler` às 20h permanece. Eventos já acontecidos também podem ser movidos quando houver sobreposição. Se dois eventos atingidos começarem no mesmo horário, não escolher uma ordem sozinho: pedir confirmação no chat sem gravar o lote; no REST, informar que a ordem precisa ser definida. Depois da confirmação, reler o dia e recalcular antes do commit. O agente não deve fazer alterações temporais livres fora dessa regra.
- Ocorrências recorrentes podem ser deslocadas pelo rearranjo, mas somente a ocorrência atingida deve ser destacada e atualizada. A série não muda.

## Consulta pronta de um dia

[`day-context.sql`](./day-context.sql) é a consulta parametrizada proposta para `get_day_context(date)`: recebe `userId` do ator, `YYYY-MM-DD` validado pela API, usa limites de meia-noite em `America/Sao_Paulo` e devolve todos os eventos que tocam o dia com itens, interrupções e tags, mais as tarefas vinculadas a esses eventos e as notas vinculadas aos eventos ou a essas tarefas. Tarefas e notas soltas continuam acessíveis por `query_data`.

Na implementação, uma porta `DayContextQuery` executará essa consulta em transação somente de leitura, após materializar as recorrências necessárias ao dia consultado, inclusive ocorrências iniciadas no dia anterior que o atravessam. A skill recebe apenas `date`; o modelo nunca envia `userId` nem SQL. Se o JSON exceder o orçamento da ferramenta, retornar paginação ou erro explícito com continuação, nunca truncar silenciosamente. A consulta pronta não substitui `query_data` para relatórios e perguntas de outras janelas. Ambas as consultas enxergam o banco confirmado, não as mudanças ainda preparadas na sessão.

## Etapas de implementação

1. **Contratos e configuração:** acrescentar `JEV_API_KEY` a `.env.example`, `env.tmpl`, `apps/api/src/config/env.ts` e ao escopo `api-runtime` do carregador 1Password; cadastrar a variável no 1Password Environment. Mantê-la apenas no servidor. Usar um `JevRoutingGateway` via `POST https://api.typesafe.ai/v1/systemone`, autenticação Bearer, `model: "jev-latest"`, timeout, cancelamento e validação de resposta. Fixar/registrar a versão resolvida do modelo para avaliação.
2. **Roteador:** criar tipos de respostas e política de limiar em módulo próprio. Injetar no `RunAgentUseCase`; compartilhar o caminho REST/chat e propagar `AbortSignal`. Bater as perguntas em uma chamada quando independentes. Registrar escolha, confiança, fallback, latência e versão do modelo sem logar a chave nem o texto integral do usuário.
3. **Contexto diário:** integrar `get_day_context` com a consulta pronta e materialização de recorrências. Validar `date`, escopo, volume e dias com eventos que atravessam a meia-noite.
4. **Especialistas e notas:** montar listas de skills por rota e prompts por capacidade. Formalizar JSON de criação/update, validação Zod, normalização de nomes e tratamento de campos opcionais. Adicionar `name` às notas via migração, entidade, DTOs, endpoints, skill e clientes; preencher notas existentes a partir da primeira linha útil de `content`, com fallback `Nota`, sem mudar o conteúdo. Preservar `query_data` nos especialistas.
5. **Reorganização:** implementar e testar uma função pura que recebe eventos existentes e a alteração pretendida, desloca em cadeia os eventos atingidos preservando duração e para na primeira folga. Preparar todas as revisões na mesma sessão e confirmar num commit. Destacar apenas as ocorrências recorrentes atingidas. Cobrir eventos passados e o pedido de confirmação quando houver dois inícios simultâneos.
6. **Migração e observação:** executar o roteador em modo de comparação com casos rotulados; só ativar decisões automáticas após medir acerto em português real, custo e latência. Cobrir consulta, criação, update, pedido misto, múltiplas entidades, nota, remoção, referência pronominal, evento cruzando dia, conflito e falha do JEV.

## Critérios de aceite

- Consulta pura nunca recebe ferramentas de escrita; especialista único recebe somente sua escrita e as duas consultas; pedido complexo preserva as capacidades necessárias.
- A rota escolhida é reproduzível em testes com respostas JEV simuladas, inclusive `confidence` ou probabilidade exatamente `0,92` (não passa), timeout e resposta inválida.
- Nenhuma saída JSON inválida é gravada; um pedido com múltiplas alterações é atômico; conflito de revisão não sobrescreve edição concorrente.
- “Parei de trabalhar agora” lê o dia pertinente e atualiza o registro de `Trabalho` quando houver alvo inequívoco; o rearranjo segue a regra decidida e não altera registros fora do escopo.
- A consulta diária devolve registros de um único usuário, inclui eventos que cruzam o dia e sinaliza explicitamente qualquer limite de volume.
- REST e chat continuam coerentes entre resposta pública, entidades gravadas e histórico.

## Escolhas técnicas para a implementação

- Falha ou timeout do JEV encaminha ao agente complexo, com métrica e log do erro. Ausência de `JEV_API_KEY` no ambiente de produção deve falhar na configuração, em vez de produzir fallback silencioso.
- Pedido que exige simultaneamente relatório e escrita segue ao agente complexo. A consulta usada para executar uma criação/update não muda a rota.
- A API e o chat continuam com `agentResponse: string`; apenas a saída interna do escritor é JSON. Para pedidos complexos que também precisam responder uma consulta, o envelope pode conter um campo `report` validado separadamente dos comandos; a resposta pública combina relatório com o resumo das mudanças confirmadas.
- O contexto diário contém eventos completos e registros vinculados. Mensagens antigas do chat continuam disponíveis pelo mecanismo de memória já existente.
- Se dois eventos simultâneos forem atingidos, perguntar **qual vem primeiro**; um simples “sim” não define a ordem. Recarregar o dia depois da resposta e não gravar o lote anterior.
- Conferir os campos realmente obrigatórios dos schemas de treino e sono antes de escrever as perguntas de esclarecimento. Na avaliação, medir separadamente acerto do roteamento, correção dos comandos e efeitos do rearranjo.

## Fontes do JEV

- [Choice e batching](https://docs.typesafe.ai/primitives/choice)
- [Confiança e seus limites](https://docs.typesafe.ai/confidence)
- [Roteamento por intenção](https://docs.typesafe.ai/patterns/intent-routing)
- [Referência da API](https://docs.typesafe.ai/api)
