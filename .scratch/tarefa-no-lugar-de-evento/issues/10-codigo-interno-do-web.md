# 10: Código interno do web com nome de tarefa

**What to build:** Quem lê o web encontra tarefa em todo lugar. Os módulos de tela (detalhe, linha, glifos, marca de tipo e de prioridade, seletor de status, diálogo de exclusão, botão de voz, formulários de criação, tira da semana), os hooks e os utilitários passam a ter nome de tarefa, e o módulo da tela Tarefas ganha um nome que não colide (como "lista de tarefas"). Nada muda para quem usa: textos e endereços mudam no ticket 11.

**Blocked by:** 06 (Contrato de tarefa)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md). Spec: "Web" (módulos de tela e troca por símbolo).

- [ ] Nenhuma pasta, arquivo, componente, hook, classe CSS de módulo, tipo ou variável de domínio do web tem "event" no nome, fora das exceções da varredura.
- [ ] Os eventos de DOM, os parâmetros `event` dos handlers e o `text/event-stream` ficam intactos.
- [ ] O módulo da tela Tarefas e o módulo de tarefa não colidem de nome.
- [ ] Os testes de tela conferem o mesmo que antes e passam.
- [ ] `pnpm run test:unit` e `pnpm run typecheck` verdes; a área "web, código" sai da linha de base.
