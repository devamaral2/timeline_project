# Smoke do Twilio Verify

Confere, contra o provedor de verdade, se a entrega de OTP está de pé. É o
único comando do serviço que gasta dinheiro e alcança um telefone real.

## Antes

- Ambiente com `AUTH_OTP_PROVIDER=twilio` e as três credenciais:
  `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`.
- Um número de teste autorizado. **Não use número de usuário.**

## Executar

```bash
pnpm --filter @repo/auth run smoke-twilio -- --to +5511999999999 --channel sms
```

Para WhatsApp, ligue `AUTH_TWILIO_WHATSAPP_ENABLED=true` e troque o canal:

```bash
pnpm --filter @repo/auth run smoke-twilio -- --to +5511999999999 --channel whatsapp
```

## Ler o resultado

Sucesso imprime apenas a confirmação e o canal:

```json
{"delivered":true,"channel":"sms"}
```

e o telefone recebe um código de seis dígitos. Não há nada para verificar
depois: o smoke testa o envio, não a conferência.

Falha sai com código diferente de zero e **não imprime configuração, token nem
a resposta do provedor**. Para investigar, olhe o painel do Twilio pelo
`ServiceSid`; o log do serviço não guarda o corpo da resposta.

## Erros comuns

| Sintoma | Causa provável |
| --- | --- |
| `AUTH_OTP_PROVIDER=twilio is required` | ambiente está em `fake`, ou falta uma das três credenciais |
| `usage: smoke-twilio --to E164_PHONE --channel sms\|whatsapp` | número fora do formato E.164, ou canal inválido — nada foi enviado |
| falha sem mensagem | credencial inválida, número não autorizado, ou canal desabilitado no Verify Service |

## Se o Twilio estiver fora

O login por código de recuperação não depende do provedor: um usuário com os
dez códigos em mãos continua entrando, e a troca de senha continua possível
via step-up por recuperação. Convite novo e login por OTP ficam bloqueados até
o provedor voltar — as rotas respondem **503**, não 500.
