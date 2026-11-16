# Glossário do diálogo com IA

| Termo | Significado neste plano |
| --- | --- |
| Turno | Pedido atual do usuário e resposta associada, via REST ou chat. |
| Rota | Conjunto de skills entregue ao agente OpenRouter depois do julgamento JEV. |
| Consulta pura | Pedido que lê dados sem preparar criação, update ou remoção. |
| Escrita única | Um pedido que altera uma única entidade; pode afetar outros horários se o rearranjo aprovado exigir. |
| Pedido complexo | Pedido com várias entidades, exclusão lógica, nota ou tipo não reconhecido pela rota especializada. Toda escrita pode usar consultas sem se tornar complexa. |
| Exclusão lógica | Operação que marca `deleted_at` em vez de remover fisicamente o registro; passa pelo agente complexo. |
| Contexto do dia | Fotografia das tarefas que tocam o dia civil local e dos registros associados, retornada por consulta pronta. |
| Confiança JEV | Medida derivada da distribuição das opções de uma resposta `Choice`; não é garantia de acerto do fluxo inteiro. |
| Opção escolhida | Alternativa `Choice` com maior probabilidade na resposta JEV. |
| Sessão de mudanças | Mudanças preparadas pelo agente e validadas antes do commit único. |
| Rearranjo | Deslocamento em cadeia das tarefas seguintes que passaram a se sobrepor, preservando a duração de cada um e parando na primeira folga. |
| Ocorrência destacada | Instância de recorrência revisada sem alterar a regra da série. |
| Processo | Pedido tratado pela rota por processo (ADR 003): gravado antes de qualquer entidade e ligado a cada uma que seus passos criam ou editam. |
| Passo | Trabalho de um processo entregue à fila de um agente (criar tarefas, criar artefatos...). Termina em verde (sucesso) ou vermelho (falha). |
| Finalização | Fila com lock por processo em que cada entidade concluída é comparada, pelo JEV, com as já criadas para decidir vínculos. |
| Fallback | Fila do pedido que não cai em nenhuma operação de entidade; seu agente responde ou, nas fases seguintes, orquestra os especialistas. |
| Hermes | Agente de terceiros (`nousresearch/hermes-agent`) que roda como container interno e executa as automações. Nunca é exposto: só a API fala com ele (ADR 004). |
| Automação | Trabalho recorrente ou agendado ("todo dia às 7h...") que o Hermes guarda e dispara pelo cron dele, em vez de virar entidade da agenda. |
| Rota de automação | Ramo do roteador por processo (ADR 003) que entrega ao Hermes o pedido classificado como automação e devolve a resposta ao mesmo chat. |
| Atualização diária | Rotina agendada na VPS que troca a imagem do Hermes pela `stable` mais recente, valida e volta ao digest anterior se a validação falhar. |
| MCP do Hermes | Serviço nosso (`apps/mcp`) pelo qual o Hermes cria, lê e edita tarefas, artefatos e tarefas recorrentes do dono. Não apaga; a identidade vem da credencial, nunca de um argumento. |
| Chave de idempotência | Texto escolhido pela automação (`resumo-diario:2026-11-03`) que torna uma criação repetível: a segunda chamada devolve a entidade já criada. Vale por usuário e rota (`Idempotency-Key`). |
