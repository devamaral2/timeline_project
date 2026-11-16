# 02: Glossário, ADR 0015 e instruções

**What to build:** A linguagem do domínio passa a dizer tarefa. O glossário troca evento por tarefa em todas as entradas da agenda, uma ADR nova registra a troca de nome, e as instruções que os agentes de código leem (skill de entidades, documentação de agentes) param de ensinar "evento".

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md). Spec: "Vocabulário", "Documentação e instruções" e a nota sobre a ADR 0011. ADRs 0011 e 0014. Use a skill `domain-modeling` para o formato do glossário e da ADR.

- [ ] O glossário tem a entrada **Tarefa** no lugar de Evento, com "evento" na lista _Avoid_ e sem "tarefa" nela; as entradas Tarefa de referência, Tarefa longa, Agenda, Fim planejado, Executor, Relação, Pedido, Execução agendada, Passo, Entrada e Agente de entidade dizem "tarefa" onde diziam "evento".
- [ ] A ADR 0015 registra que a entidade única se chama Tarefa / Task, que ela substitui só o nome usado nas ADRs 0011 e 0014, sem mudar decisão de modelo, e que nenhuma estrutura antiga é mantida.
- [ ] As ADRs antigas não são reescritas.
- [ ] O TDD do banco novo e a spec do web no banco novo ganham uma nota curta apontando para a ADR 0015.
- [ ] A skill de entidades e a documentação de agentes do repositório falam de tarefa.
