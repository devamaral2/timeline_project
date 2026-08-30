# ADR-007 — Deploy push via SSH com chave restrita

**Status:** aceita · **Data:** 2026-08-25

## Contexto

O CI produz uma imagem no GHCR. Falta o mecanismo que faz o servidor passar a rodar essa
imagem nova. As duas famílias são: **push** (o CI alcança o servidor e manda atualizar) e
**pull** (algo dentro do servidor observa uma fonte e se atualiza sozinho).

Push exige que o CI tenha uma credencial de acesso ao servidor — o que é exatamente o
ponto sensível desta decisão.

## Decisão

**Push via SSH**, com um usuário dedicado (`ci`) cuja chave está amarrada a um único
comando através da diretiva `command=` no `authorized_keys`.

## Alternativas consideradas

**Watchtower.** Um container que observa o registry e atualiza automaticamente quando
aparece imagem nova. Modelo pull, sem credencial saindo do servidor. Dois problemas
sérios: você perde controle de **quando** o deploy acontece — pode ser no meio do seu pico
de tráfego, ou às 3h enquanto você dorme — e não há passo de verificação nem rollback
automático. Além disso, o Watchtower precisa do socket do Docker, adicionando mais um
processo privilegiado.

**Agente pull caseiro (cron + script).** Um script no servidor que a cada N minutos
verifica se há imagem nova e atualiza. Elimina a credencial no CI. O custo é latência
(até N minutos entre push e deploy) e um componente próprio para manter. **É uma opção
razoável** e vale considerar se a chave no GitHub te incomodar.

**GitOps (ArgoCD, Flux).** O modelo mais seguro: um agente dentro do servidor observa o
repositório git e aplica o estado desejado. Nenhuma credencial de servidor sai de casa,
e o git vira a fonte única de verdade com histórico auditável. É o padrão em ambientes
maduros. Descartado porque ArgoCD e Flux são ferramentas de Kubernetes — o equivalente
para Compose exigiria montar algo caseiro. Volta à mesa se você retornar ao Kubernetes.

**Webhook + receptor no servidor.** Um serviço leve escutando um endpoint que dispara o
deploy. Troca a credencial SSH por um segredo de webhook, e adiciona um serviço exposto —
que precisa ser protegido, atualizado e monitorado. Não melhora a postura de segurança de
forma clara.

**OIDC do GitHub Actions.** Esta merece precisão, porque é frequentemente citada como "a
solução". O OIDC elimina credenciais de longa duração emitindo tokens efêmeros — mas
funciona contra provedores que sabem **validar** esses tokens: AWS, GCP, Azure, HashiCorp
Vault. **Um VPS com SSH não tem esse mecanismo nativamente.** Seria necessário um broker
que troque o token OIDC por um certificado SSH de curta duração — complexidade
considerável para um servidor pessoal. A restrição por `command=` é a mitigação prática e
eficaz neste cenário.

**Deploy manual por SSH.** Zero automação, zero credencial armazenada, controle total.
Funciona no começo e não escala com a frequência de mudanças. Continua documentado no
[runbook](../12-runbook-operacao.md) como caminho de emergência.

## O risco e a mitigação

A chave SSH nos secrets do GitHub é, potencialmente, a credencial mais poderosa do setup.
Se a conta do GitHub for comprometida, ou se uma Action de terceiro maliciosa conseguir
ler os secrets, essa chave vaza.

A mitigação é limitar o que ela pode fazer:

```
command="/home/ci/deploy.sh",no-agent-forwarding,no-port-forwarding,no-pty,no-X11-forwarding ssh-ed25519 AAAA...
```

Com isso, qualquer comando enviado é **ignorado** — apenas o script de deploy roda. Um
atacante de posse da chave consegue redeployar sua aplicação e nada mais: sem shell, sem
leitura de arquivos, sem túnel para o Postgres.

Complementos: usuário `ci` separado do usuário pessoal, sem acesso aos `.env` de outros
diretórios; chave exclusiva, nunca reusada; `AllowUsers` no `sshd_config` restringindo
quem pode logar.

## Consequências

**Positivas.** Deploy imediato após o push, sem latência de polling. Controle explícito de
quando acontece. Nenhum componente extra rodando no servidor. Superfície da credencial
reduzida a uma única ação. Fácil de entender e depurar.

**Negativas.** Existe uma credencial de servidor armazenada fora do servidor. Se o script
de deploy precisar mudar, é preciso editá-lo no servidor (não versionado no repositório —
uma inconsistência reconhecida). Sem verificação automática pós-deploy nem rollback
automático.

**Melhoria pendente:** fazer o `deploy.sh` verificar o healthcheck após subir e reverter
automaticamente para a imagem anterior se falhar. Isso fecha a maior lacuna atual.

## Quando revisitar

- Se voltar ao Kubernetes: GitOps com Flux ou ArgoCD é claramente superior
- Se surgirem múltiplos servidores: um modelo pull escala melhor que N chaves de push
- Se a chave no GitHub for motivo de desconforto: o agente pull caseiro é a troca direta
- Se o GitHub passar a suportar OIDC contra SSH nativamente, migre
