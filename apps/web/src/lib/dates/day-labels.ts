/** Rótulos de dia do redesenho. As chaves de dia são datas civis; o meio-dia em UTC evita que o fuso vire o dia. */
function atNoon(dayKey: string) {
  return new Date(`${dayKey}T12:00:00Z`);
}

/** "segunda-feira, 14 de setembro": a data em mono no topo das telas (a caixa alta é do CSS). */
export function weekdayDate(dayKey: string) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(atNoon(dayKey));
}

/** "seg, 14 de set": a data curta, ao lado de um atalho ou numa linha de lista. */
export function briefDate(dayKey: string) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(atNoon(dayKey)).replaceAll(".", "");
}
