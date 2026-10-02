# ADR 001 — Roteamento do diálogo por JEV

Status: **proposto para implementação**.

## Contexto

O agente atual recebe todas as skills em cada turno. Um pedido simples de consulta ou registro disputa atenção com capacidades sem relação com o pedido. A mesma rota atende REST e chat, e o servidor já dispõe de sessão de mudanças e commit atômico.

## Decisão proposta

Colocar um roteador JEV antes da chamada ao OpenRouter. Perguntas tipadas selecionam intenção, cardinalidade e entidade; código exige simultaneamente `confidence > 0,92` e probabilidade da opção escolhida `> 0,92` em cada resposta usada e constrói a lista de skills. O JEV não executa SQL nem escreve entidades. A API mantém a autoridade sobre identidade, validação, horários, conflito e commit.

Usar uma consulta diária parametrizada e uma regra determinística de rearranjo antes de gravar alterações dependentes do dia. O rearranjo preserva a duração de eventos deslocados e para na primeira folga. Encaminhar pedidos complexos, classificações com `0,92` ou menos e falhas técnicas do JEV ao agente complexo. Na configuração de produção, exigir `JEV_API_KEY`.

## Consequências

- Prompts e ferramentas ficam menores nos casos comuns.
- Mais uma chamada externa antecede o OpenRouter; medir latência, custo e indisponibilidade.
- A confiança de `Choice` resume a concentração da distribuição e não prova que o pedido foi interpretado corretamente. O limiar exige avaliação com dados reais do produto.
- O limiar de 92% controla apenas o roteamento JEV; os comandos produzidos pelo OpenRouter são validados por schema e pelas regras do domínio.
- O contrato público preserva `agentResponse: string`; JSON é o protocolo interno dos escritores e a API produz a mensagem exibida ao usuário.

## Referências

- [Plano](./refactor-plan.md)
- [TypeSafe: confidence](https://docs.typesafe.ai/confidence)
- [TypeSafe: intent routing](https://docs.typesafe.ai/patterns/intent-routing)
