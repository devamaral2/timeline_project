# 21: Configurações e sair

**What to build:** Pelo `/configuracoes` do chat, o usuário troca o tema entre sistema, claro e escuro e sai da conta.

**Blocked by:** 12

**Status:** ready-for-agent

**Leia antes:** o [README](README.md). No web: a vista de configurações do chat.

- [ ] O tema segue o sistema por padrão; a escolha manual fica no DataStore e vale ao reabrir.
- [ ] "Sair da conta" manda `POST /auth/logout`, apaga a sessão, cancela os lembretes agendados (quando o ticket 22 existir) e volta ao login, mesmo se o Auth não responder.
