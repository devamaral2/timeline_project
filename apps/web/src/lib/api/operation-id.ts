/**
 * Id de mensagem estável para um envio (`clientMessageId`): reenviar o mesmo id devolve o pedido já aceito.
 * Não pertence a nenhuma área da API; quem envia um pedido (chat, barra de edição, voz) gera o id aqui.
 */
export function operationId(): string {
  return crypto.randomUUID();
}
