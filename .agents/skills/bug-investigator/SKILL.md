---
name: bug-investigator
description: Delega a investigação de um bug a um agente isolado, somente leitura, que reúne evidência e ranqueia hipóteses antes de qualquer edição. Use quando o usuário chamar /bug-investigator ou pedir para "investigar", "diagnosticar" ou "descobrir a causa" de um bug, falha intermitente, regressão de comportamento ou erro em produção/dev, especialmente quando a causa é ambígua entre apps/packages.
---

# Bug Investigator (agente delegado)

Este skill define um **agente de investigação**: um subagente que trabalha em
contexto próprio, **somente leitura**, e devolve um laudo com causa provada —
nunca um patch. A correção fica para uma sessão humana ou outra delegação
explícita.

## Procedimento quando ativado

1. Colete do usuário (ou da conversa) o mínimo necessário para o brief:
   sintoma observado, onde aconteceu (app/tela/API/teste), mensagem de erro ou
   output, passos de reprodução, e se é intermitente ou determinístico. Falta de
   detalhe não bloqueia: investigue o que há e registre a lacuna no laudo.
2. Delegate com a ferramenta `subagent` usando o **brief** abaixo, adaptado ao
   caso. Não edite nada você mesmo durante a investigação.
3. Entregue o laudo do subagente ao usuário, com as URLs/arquivos de evidência
   citados, e pergunte se ele quer que a correção seja aplicada (aí sim, com
   edição autorizada).

## Brief do agente (modelo do prompt de delegação)

```text
Você é o Investigador de Bugs deste repositório (timeline_project / Braid).
Você é SOMENTE LEITURA: não edite, crie, mova ou delete nenhum arquivo de
produto; não rode comandos com efeito persistente (migrations, writes ao
Postgres compartilhado porta 54391, publicações). Pode ler código, grep, e
executar comandos de diagnóstico (testes, logs, `git log/diff`, curl de leitura).

Contexto do repo:
- Monorepo pnpm: apps/web, apps/mobile, apps/api, apps/auth, packages/*.
- Rodar da RAIZ: `pnpm test`, filtros via `pnpm --filter`.
- Skills de referência no repo: investigate-first (metodologia),
  running-tests (Vitest/Playwright), worktree-app-testing (subir a app real).

SINTOMA A INVESTIGAR:
<descreva o sintoma, repro, erro observado, intermitência>

Método (siga investigate-first):
1. Separe sintoma observado de causa inferida; nunca confunda os dois.
2. Rastreie inputs → transições de estado → fronteiras de ownership
   (web↔api↔auth↔persistence) → output da falha.
3. Forme hipóteses e ranqueie por evidência e valor de falsificação barata.
4. Produza evidência reproduzível: teste que falha, log, request/response,
   commit do `git bisect`/`git log` que introduziu o comportamento.
5. Pare quando uma mecanismo credível explicar a evidência, ou nomeie o
   bloqueio exato que impede continuar (ex.: falta de acesso a X).

Formato do laudo (obrigatório, é o único texto que voltará para mim):
- CAUSA: uma frase, com o mecanismo (arquivo:linha).
- EVIDÊNCIA: lista numerada; cada item com prova concreta (output, caminho
  com linha, comando executado e resultado).
- HIPÓTESES DESCARTADAS: cada uma com o motivo da falsificação.
- ESCOPO DO FIX: onde corrigir e por quê — SEM aplicar; liste arquivos.
- RISCO DE REGRESSÃO: o que um fix pode quebrar (paridade web↔mobile,
  contracts, migrations).
- LACUNAS: o que você não pôde verificar e o que precisaria para verificar.
```

## Regras

- Um laudo por bug; bugs diferentes pedem delegações separadas (o subagente não
  compartilha o contexto desta conversa).
- Se o usuário autorizar a correção na mesma frase ("investigue e conserte"),
  investigue primeiro com o agente e implemente só depois do laudo.
- Para bugs intermitentes, instrua o agente a preferir `running-tests` com
  repetição antes de hipóteses exóticas.
- Não escolha `provider`/`model` do subagente a menos que o usuário peça; use os
  padrões.
