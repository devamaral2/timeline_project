export function getFoodEventName(now: Date): string {
  const minutes = now.getHours() * 60 + now.getMinutes();

  if (minutes <= 180 || minutes >= 1081) return "Jantar";
  if (minutes <= 390) return "Desjejum";
  if (minutes <= 600) return "Café da manhã";
  if (minutes <= 690) return "Colação";
  if (minutes <= 959) return "Almoço";
  return "Lanche da tarde";
}
