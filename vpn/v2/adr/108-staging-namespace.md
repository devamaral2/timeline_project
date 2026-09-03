# ADR-108 — Staging por namespace no mesmo nó

**Status:** aceita · **Data:** 2026-08-31

## Contexto

O v1 não tinha ambiente de teste porque não cabia em 4 GiB: testar mudança em produção era
a única opção, e o teste era o deploy. Com 16 GiB e namespaces, um segundo ambiente custa
~320 MiB de piso garantido.

## Decisão

Um namespace `staging` com web, API e Redis próprios, `PriorityClass` baixa, Ingress com
autenticação básica e overlay Kustomize sobre a mesma base de produção. O **PostgreSQL é
compartilhado**, com database `timeline_staging` e role `staging_app`. Dados de produção
**não** são copiados.

## Alternativas consideradas

**Não ter staging.** Foi a escolha do v1, forçada. Continua defensável para um projeto de
uma pessoa: um staging abandonado é pior que nenhum, porque dá falsa confiança.
Descartado porque três coisas do v2 pedem ensaio — migration, troca de modelo e upgrade de
infraestrutura.

**Segundo cluster k3s.** Isolamento real. Descartado por outros 600 MiB de control plane
para um isolamento que namespace e `PriorityClass` já dão em boa parte. É a resposta a
partir do segundo servidor.

**PostgreSQL separado.** Elimina o risco de staging consumir conexões do banco de
produção. Custa 2 GiB para dado descartável. Revisitar se staging passar a rodar teste de
carga.

**Preview por pull request.** Padrão em times maiores e genuinamente ótimo. Descartado por
exigir DNS curinga, automação de ciclo de vida e um banco por preview — ganho pequeno
sobre um staging fixo, com um autor.

**Copiar produção para staging.** Dado real é o melhor dado de teste. Descartado por
privacidade: o banco tem eventos pessoais, e copiá-los para um ambiente com proteção menor
cria uma segunda cópia de dado sensível. Seed sintético é o caminho.

## Consequências

**Positivas.** Migration, prompt, modelo e upgrade validados antes de produção. E um efeito
indireto que talvez seja o maior: dois ambientes **obrigam** os manifestos a separar
estrutura de configuração, o que é o que torna o ambiente recriável.

**Negativas.** Mais um ambiente para manter atualizado. Carga de staging compartilha CPU e
conexões do PostgreSQL de produção — daí o pool começar em 3 conexões e teste de carga
ficar proibido contra este banco. Um staging que diverge de produção deixa de testar
alguma coisa, e a causa raiz disso é sempre copiar em vez de fazer overlay.

## Quando revisitar

- Se você perceber que não está usando: desligue e assuma, em vez de manter um ambiente que
  dá falsa confiança.
- Se teste de carga entrar em pauta, o PostgreSQL separado deixa de ser luxo.
- Ao passar de um nó, o cluster separado passa a fazer sentido.
