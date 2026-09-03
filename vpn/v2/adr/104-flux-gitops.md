# ADR-104 — GitOps com Flux e SOPS, deploy por pull

**Status:** aceita · **Data:** 2026-08-31
**Supersede:** [ADR-007 — Deploy push via SSH com chave restrita](../../docs/adr/007-deploy-ssh.md)

## Contexto

A ADR-007 escolheu deploy push por SSH e identificou o próprio problema com clareza:
*"Push exige que o CI tenha uma credencial de acesso ao servidor — o que é exatamente o
ponto sensível desta decisão."* A mitigação foi boa: usuário dedicado, chave amarrada a um
único comando. Ainda assim, um comprometimento do GitHub Actions dava acesso ao servidor.

O v1 também deixou aberto o item 2.7 do checklist, "gestão de segredos com caminho de
evolução": o que existia era um `.env` em modo 600, sem histórico, sem revisão e sem cópia
fora do servidor.

A ADR-101 colocou um cluster no servidor, o que torna o modelo pull possível.

## Decisão

Usar **Flux** reconciliando a partir de `deploy/` no monorepo, com os controllers de
automação de imagem observando o GHCR. Segredos versionados cifrados com **SOPS e age**.
O usuário `ci`, o script `deploy-from-ci` e os secrets `VPS_*` são removidos.

Os manifestos ficam no **mesmo monorepo**, não em repositório separado.

## Alternativas consideradas

**Manter o push por SSH.** Já funciona e é uma peça a menos. Seria a escolha certa sem
Kubernetes — GitOps exige um controlador dentro do cluster. Descartada porque agora dá
para eliminar a credencial em vez de mitigá-la.

**Argo CD.** UI própria, mais popular, mais presente em vaga de emprego. Descartado por
consumo e por a UI querer ser exposta, o que acrescenta host, autenticação e superfície.

**Sealed Secrets.** Mais simples de operar. Descartado porque o SOPS decifra localmente
com a mesma chave, o que permite ler e editar um segredo sem o cluster — exatamente o que
se precisa numa recuperação de desastre.

**External Secrets com cofre.** O desenho correto a partir de duas pessoas, e resolve
rotação de verdade. Descartado por acrescentar um serviço ou uma assinatura para um
servidor com um usuário.

**Repositório separado para manifestos.** A recomendação padrão. Descartado porque a
mudança do LiteLLM toca `apps/api` e `deploy/` ao mesmo tempo, e revisar as duas no mesmo
PR vale mais que a separação de ciclos de vida.

## Consequências

**Positivas.** Nenhuma credencial de servidor no CI. Histórico e revisão para toda mudança
de infraestrutura e de segredo. Detecção de drift: o git passa a descrever o cluster de
verdade. Recuperação de desastre vira `flux bootstrap` mais a chave age.

**Negativas.** Mais quatro a seis pods. Uma correção manual urgente exige `flux suspend`,
que é um passo a mais sob pressão. E o mais importante: **acesso de escrita ao repositório
vira acesso de deploy em produção** — a proteção de branch e o 2FA deixam de ser boa
prática e viram controle de acesso ao servidor.

**Risco sem plano de recuperação.** Perder a chave age torna todo segredo versionado
ilegível. Duas cópias, nenhuma no git.

## Quando revisitar

- Se uma segunda pessoa entrar no projeto — aí External Secrets e rotação real passam a
  valer o custo.
- Se a infraestrutura ganhar vida própria, separar o repositório fica barato.
- Se o Flux se mostrar frágil na prática, o Argo CD é a alternativa direta.
