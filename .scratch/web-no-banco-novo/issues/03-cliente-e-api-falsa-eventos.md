# 03: Cliente da API e API falsa: eventos e tags

**What to build:** Passa a existir um módulo único, o cliente da API, com uma função para cada rota de eventos e de tags, e uma API falsa em memória para os testes, que responde a essas rotas e confere corpos e respostas contra os esquemas do contrato. Nenhuma tela usa o cliente ainda.

**Blocked by:** 02 (Web usa os contratos compartilhados)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: “Cliente da API”, “Rotas que o web passa a usar” e “Decisões de teste” (costura 1). Swagger da API em `/docs`.

- [x] Há funções para: agenda de uma janela, lista de tarefas, criar, ler, editar e apagar evento, subtarefas de um evento e sugestão de tags.
- [x] A função da agenda segue o `nextCursor` até a janela acabar e devolve uma lista só.
- [x] A lista de tarefas aceita os filtros `actor`, `status` e `priority` (vários valores), `tag`, `q` e `longRunning`.
- [x] Toda edição envia `expectedRevision`; toda criação envia `Idempotency-Key`.
- [x] O cliente devolve erros que a tela distingue: não encontrado, revisão desatualizada, entrada inválida e sem permissão. Resposta sem corpo (204) não quebra.
- [x] A API falsa entra no lugar do cliente HTTP autenticado, a mesma costura que os testes de tela de hoje usam.
- [x] A API falsa guarda os eventos em memória, incrementa a revisão a cada edição, responde revisão desatualizada, não encontrado, devolve a mesma resposta para a mesma chave de idempotência e pagina a agenda.
- [x] A API falsa faz o teste falhar quando um corpo recebido ou uma resposta devolvida não passa no esquema do contrato.
- [x] Os testes do cliente rodam contra a API falsa.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
