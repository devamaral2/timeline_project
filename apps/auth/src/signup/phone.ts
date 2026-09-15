/**
 * Normaliza o telefone para E.164 na borda. Aceita a formatacao que as pessoas
 * digitam — espacos, hifens, pontos, parenteses e o prefixo internacional `00` —
 * mas exige o codigo do pais: sem `+`/`00` nao ha como saber de onde e o numero,
 * e adivinhar gravaria um telefone errado.
 */
export function normalizePhone(raw: string): string | null {
  const compact = raw.trim().replace(/[\s().-]/g, "");
  const international = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  return /^\+[1-9][0-9]{7,14}$/.test(international) ? international : null;
}
