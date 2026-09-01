export function getMealEventName(now: Date, timeZone = "America/Sao_Paulo"): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: "hour" | "minute") =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const minutes = value("hour") * 60 + value("minute");
  if (minutes <= 180 || minutes >= 1081) return "Jantar";
  if (minutes <= 390) return "Desjejum";
  if (minutes <= 600) return "Café da manhã";
  if (minutes <= 690) return "Colação";
  if (minutes <= 959) return "Almoço";
  return "Lanche da tarde";
}
