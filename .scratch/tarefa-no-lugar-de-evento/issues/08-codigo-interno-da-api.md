# 08: Código interno da API com nome de tarefa

**What to build:** Quem lê a API encontra tarefa em todo lugar. As features, os use cases, os serviços de domínio (agenda, sequência, mesclagem de edição, montagem de prompt, nome de refeição), os gateways, as portas, os repositórios, o kit em memória de testes e os identificadores do esquema Drizzle passam a ter nome de tarefa, e as mensagens de erro que chegam ao cliente falam de tarefa. O comportamento não muda.

**Blocked by:** 04 (Banco da API renomeado no lugar), 07 (Rotas /api/tasks)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md). Spec: "API" e "Decisões de teste", costura 2.

- [ ] Nenhuma pasta, arquivo, classe, função, variável ou tipo de domínio da API tem "event" no nome, fora das exceções da varredura.
- [ ] Os identificadores do esquema Drizzle e dos repositórios usam tarefa, alinhados aos nomes físicos do ticket 04.
- [ ] As mensagens de erro devolvidas ao cliente falam de tarefa, no feminino ("Tarefa não encontrada").
- [ ] Os testes de use case, de serviço e de integração continuam conferindo o mesmo comportamento, agora com nomes de tarefa.
- [ ] Os testes de integração, `pnpm run test:unit` e `pnpm run typecheck` verdes; a área "api" sai da linha de base, exceto o que o ticket 09 cobre (agentes).
