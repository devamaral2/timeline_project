package app.braid.mobile.domain.reminder

/**
 * O aviso que explica a permissão de alarme exato (Android 12+) aparece quando ela falta, há lembretes guardados para
 * tocar e o usuário ainda não o dispensou. Sem ela os lembretes seguem como alarmes inexatos, que o sistema pode adiantar
 * ou atrasar um pouco, então o aviso é um convite, nunca um bloqueio.
 */
fun shouldExplainExactAlarm(
    canScheduleExact: Boolean,
    dismissed: Boolean,
    hasSavedReminders: Boolean,
): Boolean = !canScheduleExact && !dismissed && hasSavedReminders
