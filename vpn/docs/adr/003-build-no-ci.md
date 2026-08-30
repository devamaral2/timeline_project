# ADR-003 — Build no CI, servidor só faz pull

**Status:** aceita · **Data:** 2026-08-25

## Contexto

O código precisa virar container rodando no servidor. Existem duas famílias de estratégia:
construir no servidor a partir do código-fonte, ou construir em outro lugar e enviar a
imagem pronta.

O servidor tem 4GB de RAM, compartilhados com Postgres, Redis, Traefik e a stack de
observabilidade — restando cerca de 1.6GB de folga.

## Decisão

**Todo build acontece no GitHub Actions.** A imagem é publicada no GHCR. O servidor
executa apenas `docker compose pull && docker compose up -d`.

## Alternativas consideradas

**Build no servidor (`docker compose build`).** É o caminho intuitivo e o mais comum em
tutoriais. Inviável aqui por medição, não por preferência: `tsc` num monorepo TypeScript
consome tipicamente 2–4GB de heap, e o `docker build` adiciona seu próprio consumo. Com
1.6GB de folga, o OOM killer entra em ação — e ele escolhe a vítima por heurística,
geralmente o processo de maior consumo, que é o Postgres. **O resultado é que fazer deploy
derruba o banco de dados.**

Há um problema secundário: build no servidor depende do estado daquele servidor naquele
momento — cache, versões locais, arquivos residuais. Não é reprodutível.

**`rsync` do código + `pnpm install` no servidor.** Mesmo problema de memória, mais o
problema de ter ferramentas de build e código-fonte em produção.

**Registry próprio (Harbor, registry local).** Elimina dependência do GitHub, mas custa
200–500MB de RAM no mesmo servidor. O GHCR é gratuito e integrado às permissões do
repositório.

**Docker Hub.** Funciona, mas o plano gratuito limita pulls e exige gerenciar credenciais
separadas. O GHCR usa o `GITHUB_TOKEN` efêmero, gerado por execução e expirado ao final.

**Build local na máquina Windows + push manual.** Funciona para emergência e está
documentado no runbook. Como fluxo principal, perde reprodutibilidade e depende de você
estar na frente do computador.

## Consequências

**Positivas.** O servidor nunca fica sem memória por causa de deploy. Build reprodutível
a partir de um ambiente limpo. Runners com 4 vCPU e 16GB, gratuitos (ilimitados em
repositório público, 2.000 min/mês em privado). Lint, typecheck, testes e scan de
vulnerabilidade rodam no mesmo lugar. Deploy consome praticamente nada no servidor.

**Negativas.** Dependência do GitHub — se o Actions estiver fora, não há deploy pelo
caminho normal. Ciclo mais lento para uma correção urgente: commit, push, esperar o
pipeline. Imagens precisam trafegar pela rede (~150MB por deploy, mitigado pelo cache de
camadas).

**Mitigação.** O [runbook](../12-runbook-operacao.md) documenta o build local seguido de
push manual, para quando o CI estiver indisponível.

## Quando revisitar

- Se o servidor for para 16GB+, build local volta a ser viável (ainda assim não
  recomendado, por reprodutibilidade)
- Se você sair do GitHub, a mesma estrutura funciona em GitLab CI ou Forgejo Actions
- Se o tempo de pipeline incomodar, o Turborepo Remote Cache reduz bastante
