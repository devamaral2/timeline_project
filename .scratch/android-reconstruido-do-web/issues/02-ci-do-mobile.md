# 02: CI do mobile de volta

**What to build:** Uma mudança que quebre o app Android, ou que mude um contrato, a timeline ou o tema sem o Android acompanhar, fica vermelha no CI antes do merge.

**Blocked by:** 01

**Status:** done

**Leia antes:** o [README](README.md). Spec: "Documentação e instruções". O workflow de CI atual, que exclui `@repo/mobile`.

- [x] Um job de CI próprio roda lint e testes do mobile (com o gerador de fixtures) com JDK 17+ e Android SDK.
- [x] O job roda só quando mudam `apps/mobile`, `packages/contracts`, `packages/timeline`, `packages/theme` ou o gerador de fixtures.
- [x] O job gera o APK de debug como artifact.
- [x] Os jobs do resto do monorepo continuam excluindo `@repo/mobile`.
