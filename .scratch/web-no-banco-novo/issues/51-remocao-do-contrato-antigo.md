# 51: Remoção do contrato antigo

**What to build:** O web não tem mais nada do contrato antigo: nenhuma chamada a rota que não existe, nenhum tipo de fio próprio, nenhum módulo que só servia às telas antigas.

**Blocked by:** 11 a 49 (todos os tickets de tela)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: “Contratos no web”, “Rotas que o web passa a usar” (tabela “De onde cada chamada antiga vai”), “Paridade com o Android”.

- [ ] Nenhum arquivo do web chama `/api/tasks`, `/api/notes`, `/api/ai/process`, `/api/ai/jobs`, `/api/ai/automation` nem `/api/events/voice`.
- [ ] Os tipos de fio de tarefa, nota, processo de IA, job de IA e automação saíram do web; ficaram só os tipos que são da tela.
- [ ] Os módulos e as rotas de tela que só existiam para o contrato antigo foram apagados.
- [ ] Nenhuma tela monta caminho de API por conta própria: todas passam pelo cliente da API.
- [ ] `docs/mobile-parity.md` foi revisado: a exceção do topo diz que o web está portado e que falta o Android.
- [ ] O “Estado da implementação” do TDD do banco novo diz que o web fala os contratos novos.
- [ ] `pnpm run test:unit`, `pnpm run typecheck` e o build do web passam.
