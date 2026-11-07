# Glossário do diálogo com IA

| Termo | Significado neste plano |
| --- | --- |
| Turno | Pedido atual do usuário e resposta associada, via REST ou chat. |
| Rota | Conjunto de skills entregue ao agente OpenRouter depois do julgamento JEV. |
| Consulta pura | Pedido que lê dados sem preparar criação, update ou remoção. |
| Escrita única | Um pedido que altera uma única entidade; pode afetar outros horários se o rearranjo aprovado exigir. |
| Pedido complexo | Pedido com várias entidades, exclusão lógica, nota ou tipo não reconhecido pela rota especializada. Toda escrita pode usar consultas sem se tornar complexa. |
| Exclusão lógica | Operação que marca `deleted_at` em vez de remover fisicamente o registro; passa pelo agente complexo. |
| Contexto do dia | Fotografia dos eventos que tocam o dia civil local e dos registros associados, retornada por consulta pronta. |
| Confiança JEV | Medida derivada da distribuição das opções de uma resposta `Choice`; não é garantia de acerto do fluxo inteiro. |
| Opção escolhida | Alternativa `Choice` com maior probabilidade na resposta JEV. |
| Sessão de mudanças | Mudanças preparadas pelo agente e validadas antes do commit único. |
| Rearranjo | Deslocamento em cadeia dos eventos seguintes que passaram a se sobrepor, preservando a duração de cada um e parando na primeira folga. |
| Ocorrência destacada | Instância de recorrência revisada sem alterar a regra da série. |
| Processo | Pedido tratado pela rota por processo (ADR 003): gravado antes de qualquer entidade e ligado a cada uma que seus passos criam ou editam. |
| Passo | Trabalho de um processo entregue à fila de um agente (criar eventos, criar notas...). Termina em verde (sucesso) ou vermelho (falha). |
| Finalização | Fila com lock por processo em que cada entidade concluída é comparada, pelo JEV, com as já criadas para decidir vínculos. |
| Fallback | Fila do pedido que não cai em nenhuma operação de entidade; seu agente responde ou, nas fases seguintes, orquestra os especialistas. |
