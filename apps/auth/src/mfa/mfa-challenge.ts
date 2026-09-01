export type MfaChannel = "sms" | "whatsapp";

/**
 * Um desafio de 2FA em aberto. O codigo nunca e guardado em claro: o banco tem
 * o HMAC dele, e a comparacao e feita sobre o hash.
 *
 * `attempts` e contado no servidor, e nao no cliente: e ele que transforma um
 * codigo de 6 digitos (10^6 possibilidades, quebravel em segundos por forca
 * bruta) em algo com 5 chances antes de morrer.
 */
export interface MfaChallenge { id:string; attemptId:string; requestedChannel:MfaChannel; reportedChannel:MfaChannel; providerChallengeId:string; checkCount:number; expiresAt:Date; consumedAt:Date|null; invalidatedAt:Date|null; createdAt:Date; }

/**
 * `+5511987654321` vira `+55 11 *****-4321`. O suficiente para o usuario
 * reconhecer o proprio numero sem que a tela revele o numero inteiro de alguem.
 */
export function maskPhone(phone:string):string { return `+${"*".repeat(Math.max(0,phone.length-3))}${phone.slice(-2)}`; }
