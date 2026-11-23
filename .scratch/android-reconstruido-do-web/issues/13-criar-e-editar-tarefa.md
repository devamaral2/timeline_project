# 13: Criar e editar tarefa

**What to build:** O usuário cria uma tarefa pelo `/tarefa` do chat (com o nome já preenchido se digitado), pelo "Nova tarefa" da lista vazia, ou edita uma tarefa de pessoa por "Mais ações" → Editar. O formulário tem tipo, título, status (ou "Sem status", para tarefa de referência), prioridade, início e fim, "Tarefa persistente", lembretes, tags com sugestão, local com sugestão e descrição, com Descartar e Salvar. Recorrência, hierarquia e documentos ficam para os tickets 14, 15 e 16.

**Blocked by:** 09, 12

**Status:** done

**Leia antes:** o [README](README.md). No web: a vista de edição da tarefa, o rascunho da tarefa e as partes de edição do quadro "Detalhe · edição".

- [x] Criar manda `POST /api/tasks` com `Idempotency-Key` estável no rascunho: um toque duplo em Salvar não cria duas tarefas.
- [x] Editar manda `PATCH /api/tasks/{id}` só com o que mudou e a `revision` lida; conflito avisa, relê e mantém o que foi digitado.
- [x] Datas e horas usam os seletores do Android em passos de 5 minutos. (Data: seletor Material; hora: seletor próprio de 5 em 5, o `TimePicker` do Material não tem passo.)
- [x] "Tarefa persistente" troca o fim por prazo, exige status e recusa recorrência e lembrete sem prazo, como no web; tarefa que não é longa não passa de 31 dias. (Só na edição: a criação não a tem, como no web. A recusa de recorrência fica com o ticket 14.)
- [x] Lembretes de 1 minuto a 30 dias, com adicionar e remover.
- [x] Tags sugerem por `GET /api/tags`; local sugere por `GET /api/places`.
- [x] Erro de validação da API aparece no campo que o causou. (Vale o web: erro 400/422 mostra uma mensagem geral; os erros por campo são os da validação do formulário.)
- [x] O atalho `/tarefa` do chat abre a criação, com o nome quando digitado.
