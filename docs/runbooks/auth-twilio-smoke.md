# Smoke do Twilio Verify

Use um número de teste autorizado e um ambiente configurado com
`AUTH_OTP_PROVIDER=twilio` e as três credenciais Twilio. O comando dispara uma
verificação real; não o execute por rotina contra números de clientes.

```bash
pnpm --filter @repo/auth run smoke-twilio -- --to +5511999999999 --channel sms
```

Para WhatsApp, habilite `AUTH_TWILIO_WHATSAPP_ENABLED=true` e troque o canal.
Sucesso imprime somente a confirmação de entrega e o canal; falha retorna exit
code não-zero sem expor configuração, token ou resposta do provedor.
