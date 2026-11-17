# 01: Apagar o app atual e entrar com e-mail e senha

**What to build:** O app antigo some por completo e nasce o novo, já com a base que todos os outros tickets usam. O usuário abre o app, entra com e-mail e senha, continua conectado ao reabrir e volta ao login quando a sessão não pode mais ser renovada. Depois de entrar, vê uma tela provisória com o nome dele (de `GET /auth/me`), que o ticket 03 troca pela Agenda.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md). Spec: "Ordem e fronteiras", "Stack", "Sessão e rede", "Domínio e vocabulário", "Lógica portada à mão", "Documentação e instruções". No web: o formulário de login e o serviço de sessão.

- [ ] Todo o código, os testes e os recursos do app antigo saem; o projeto Gradle novo fica no mesmo lugar, com o mesmo `applicationId` e o `package.json` fino (`lint`, `test`, `build`, `android`, `generate:theme`), e `pnpm dev:mobile` continua subindo o app.
- [ ] As camadas `ui → domain ← data` e `core` existem com Hilt, Navigation Compose com rotas tipadas e `BraidTheme`, com cores geradas de `packages/theme` e as fontes Manrope e Outfit.
- [ ] Um script da raiz gera fixtures JSON a partir dos schemas Zod e das funções TS; `pnpm --filter @repo/mobile run test` roda o gerador antes dos testes.
- [ ] A estrutura de teste com `MockWebServer` servindo fixtures está pronta e documentada na skill, e um teste confere que as fixtures de sessão decodificam nos DTOs.
- [ ] Login chama `POST /auth/login` e `GET /auth/me` direto no Auth; credencial errada mostra a mensagem do web.
- [ ] Os tokens ficam no DataStore cifrado com o Keystore; reabrir o app pula o login.
- [ ] Um 401 da API dispara uma renovação (`POST /auth/token/refresh`) e repete a chamada uma vez; renovações concorrentes viram uma só; renovação que falha apaga a sessão e volta ao login.
- [ ] Uma verificação nos testes falha se `Event`/`evento` ou `Note`/`nota` aparecerem como nome de entidade no código do app ("Nota" só como rótulo de tela).
- [ ] A skill `kotlin-android` é reescrita com o vocabulário novo e o fluxo de uma tela do começo ao fim sobre `Task`, a geração de fixtures e a fronteira de teste.
- [ ] `docs/mobile-parity.md` é recomeçado para o app novo: as exceções do "banco novo" e da troca de nome saem, e as linhas descrevem as telas do web de hoje, com o Android em `—`, menos Sessão.
- [ ] O runbook da primeira reescrita ganha uma nota apontando para a spec nova.
