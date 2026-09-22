import * as Notifications from "expo-notifications";
import type { NotificationOffsetMinutes } from "@repo/contracts";
import { computeTriggerTimes } from "./trigger-times";

export interface NotifiableEvent {
  name: string;
  startedAt: Date;
  notifyOffsetsMinutes: NotificationOffsetMinutes[];
}

/**
 * Agenda notificacoes locais no proprio aparelho — sem servidor de push,
 * sem token do Expo. So pede permissao quando ha de fato algo para agendar,
 * nunca no boot do app.
 */
export async function scheduleEventNotifications(event: NotifiableEvent): Promise<void> {
  const triggerTimes = computeTriggerTimes(event.startedAt, event.notifyOffsetsMinutes);
  if (triggerTimes.length === 0) return;

  const permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return;

  await Promise.all(
    triggerTimes.map((triggerAt) =>
      Notifications.scheduleNotificationAsync({
        content: { title: event.name, body: "Está quase começando." },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerAt },
      }),
    ),
  );
}
