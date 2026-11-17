# 22: Lembretes como notificações do Android

**What to build:** O usuário recebe uma notificação do Android no horário de cada lembrete das suas tarefas, mesmo com o app fechado. Lembretes atrasados por até 1 hora ainda disparam, nenhum dispara duas vezes, e tudo se reagenda quando a agenda muda e quando o celular reinicia. Tocar na notificação abre o detalhe da tarefa.

**Blocked by:** 07, 09

**Status:** done

**Leia antes:** o [README](README.md). Spec: "Telas e adaptações ao Android" (Lembretes). No web: as notificações de vencimento e o contrato de notificações.

- [x] O cálculo dos lembretes (offsets, fontes da agenda das últimas 24 h aos próximos 31 dias e lista acompanhada, janela de 1 h, chaves já disparadas) é portado e conferido contra fixtures do TS.
- [x] Os lembretes são agendados com `AlarmManager` exato, atrás de uma interface; sem a permissão de alarme exato, caem para o inexato.
- [x] O app pede a permissão de notificação e explica quando ela foi negada.
- [x] A fonte é relida a cada 5 min com o app aberto, a cada sincronização e no boot, e os alarmes são reagendados.
- [x] As chaves já disparadas ficam no DataStore.
- [x] A notificação abre o detalhe da tarefa.
- [x] Testes com relógio e agendador falsos cobrem a janela de 1 h, o disparo único, o reagendamento e a queda para o inexato.
