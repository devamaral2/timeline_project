package app.braid.mobile.ui.aiedit

import app.braid.mobile.domain.chat.ChatFailureCode
import app.braid.mobile.domain.chat.ChatRequestException

/** Por que o envio do pedido falhou, do ponto de vista do chat (o `startFailureCode` do web); as barras de edição o reusam. */
internal fun startFailureCode(failure: Exception): String =
    ((failure as? ChatRequestException)?.failure ?: ChatFailureCode.ConnectionFailed).code
