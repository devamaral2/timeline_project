# 11: Telas e endereços de tarefa no web

**What to build:** O usuário vê tarefa em todo o web. Criar, ver e editar uma tarefa acontece em `/<usuário>/tarefas/nova`, `/<usuário>/tarefas/<id>` e `/<usuário>/tarefas/<id>/editar`, e `/<usuário>/eventos/...` não abre nada. Todos os textos visíveis (títulos de aba, cabeçalhos, rótulos, botões, rótulos acessíveis, placeholders, toasts, erros, estados vazios, textos calculados da linha, painel do chat, barra de edição com IA e botão de voz) falam de tarefa, no feminino.

**Blocked by:** 07 (Rotas /api/tasks), 10 (Código interno do web com nome de tarefa)

**Status:** done

**Leia antes:** o [README](README.md). Spec: "Web" (rotas da tela e revisão dos textos), histórias 1 a 22 e "Decisões de teste", costura 1.

- [x] As páginas reais de criação, detalhe e edição estão em `/tarefas/...`; as rotas `/eventos/...` foram removidas, sem redirect; todo link interno aponta para `/tarefas/...`.
- [x] As páginas de mockup com o nome antigo foram renomeadas.
- [x] Nenhum texto visível nem rótulo acessível diz "evento"; "Evento de referência" e "Evento longo" viram "Tarefa de referência" e "Tarefa longa".
- [x] A concordância está no feminino em toda frase revista ("Nova tarefa", "Tarefa salva", "Tarefa excluída", "Nenhuma tarefa neste dia", "Excluir tarefa").
- [x] Os testes de tela sobre a API falsa conferem os textos novos nos fluxos de criar, ver, editar e excluir, e os endereços `/tarefas/...`.
- [x] Os seletores dos testes e2e que procuram texto ou endereço usam os novos.
- [x] `pnpm run test:unit` e `pnpm run typecheck` verdes; a área "web, textos e rotas" sai da linha de base.
