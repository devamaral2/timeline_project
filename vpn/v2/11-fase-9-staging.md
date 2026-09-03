# Fase 9 — Ambiente de staging

## 1. Objetivo

Um namespace `staging` com web, API e Redis próprios, banco `timeline_staging` no mesmo
PostgreSQL, `PriorityClass` baixa, Ingress com autenticação, e uma política escrita sobre
que dado pode entrar ali.

## 2. Por que isso existe

O v1 não tinha staging por um motivo simples: não cabia. Testar mudança em produção era a
única opção, e o "teste" era o deploy.

Com 16 GiB e namespaces, o ambiente extra custa ~320 MiB de piso garantido. Em troca você
ganha o lugar onde as três coisas mais arriscadas deste plano podem ser ensaiadas antes de
valer:

1. **Migrations.** Quando a persistência evoluir, uma migration ruim em produção é um
   incidente. Rodá-la antes contra `timeline_staging` transforma isso em um erro chato.
2. **Mudança de prompt e de modelo.** A Fase 7 tornou trocar de modelo uma questão de
   configuração. Staging é onde você compara duas lanes com tráfego real de teste, sem
   gastar orçamento de produção nem arriscar parsing quebrado.
3. **Upgrade de infraestrutura.** Versão nova do Postgres, do Traefik, do próprio k3s.

O terceiro benefício é indireto e talvez o maior: staging obriga os manifestos a serem
parametrizáveis. Um `deploy/` que só sabe descrever produção é um `deploy/` cheio de
valores fixos. Ter dois ambientes força a separação entre o que é estrutura e o que é
configuração — e é isso que torna o ambiente recriável.

## 3. Passo a passo

### 3.1 — Overlay, não cópia

```text
deploy/
  base/prod/              estrutura: Deployment, Service, probes, NetworkPolicy
  overlays/prod/          replicas 2, recursos de producao, host app.dominio
  overlays/staging/       replicas 1, recursos menores, host staging.dominio
```

⚠️ Copiar e colar os manifestos de produção é a armadilha clássica. Em dois meses os dois
divergem, staging para de representar produção, e testar nele deixa de significar alguma
coisa. Se um valor precisa ser diferente, ele é um patch no overlay — e a lista de patches
é exatamente a lista de diferenças entre os ambientes, visível num arquivo só.

### 3.2 — O que muda no overlay de staging

| Item | prod | staging | Motivo |
|---|---|---|---|
| réplicas | 2 | 1 | não há deploy sem janela para provar em staging |
| `PriorityClass` | `prod-default` | `low` | primeiro a ser despejado sob pressão |
| banco | `timeline` | `timeline_staging` | mesmo Postgres, database separada |
| Redis | database 0 e 1 | instância própria, 128 MiB | isolamento de fila e cache |
| lane de LLM | chave virtual de produção | chave própria, orçamento pequeno | staging não gasta a conta de produção |
| Ingress | público | basic auth | ver 3.4 |

O PostgreSQL é compartilhado de propósito: uma segunda instância custaria 2 GiB para
armazenar dado descartável. O isolamento vem da database e da role `staging_app` criadas
na Fase 4 — que não tem acesso nenhum ao schema de produção.

⚠️ O risco desse compartilhamento é real e precisa ser dito: uma carga pesada em staging
consome conexões e CPU do mesmo Postgres que serve produção. Por isso o pool de staging
começa em 3 conexões, e por isso teste de carga não roda contra este banco.

### 3.3 — Dados: nunca copiar produção crua

A tentação de restaurar o dump de produção em staging é grande, porque dado real é o melhor
dado de teste. Não faça.

O banco tem eventos pessoais: o que você comeu, quando dormiu, quanto treinou. Copiar isso
para um ambiente com autenticação mais fraca e menos cuidado é criar uma segunda cópia de
dado sensível, com metade da proteção — e é exatamente o tipo de coisa que o item 2.12 do
[checklist do v1](../docs/11-seguranca-checklist.md) sobre LGPD trata.

As opções, em ordem de preferência:

1. **Seed sintético.** Um script que gera eventos plausíveis. Mais trabalho na primeira
   vez, e depois é o melhor dos mundos: reproduzível, versionado, sem dado de ninguém.
2. **Dump anonimizado.** Restaurar e rodar um script que substitui textos livres. Note que
   descrição de refeição e transcrição de voz são texto livre — anonimizar de verdade é
   mais difícil do que parece.
3. **Banco vazio com poucos registros criados à mão.** Suficiente para muita coisa.

### 3.4 — Ingress protegido

`staging.SEUDOMINIO.com` com basic auth no Traefik, via um `Middleware` e um `Secret`.
Certificado pelo mesmo cert-manager, com o issuer de staging do Let's Encrypt — que é uma
coincidência de nomes, mas conveniente: o ambiente de teste usa o certificado de teste.

O item 1.12 do checklist do v1 se aplica: ambiente interno nunca sem autenticação. Um
staging aberto é uma versão da sua aplicação, possivelmente com bug conhecido, indexável
pelo Google. Acrescente `X-Robots-Tag: noindex` no mesmo middleware.

### 3.5 — Desligar quando não estiver usando

```bash
# ☸️ cluster
kubectl -n staging scale deploy --all --replicas=0
```

O critério de aborto nº 4 da Fase 0 já diz que staging é o primeiro a cair se a folga
apertar. Fora isso, desligar quando não está em uso é higiene: um ambiente parado não
consome, não gera alerta e não gasta orçamento de LLM.

Vale um `CronJob` que zera as réplicas às 22h. Ligar de volta é um comando.

## 4. Por que não fazer diferente

**Não ter staging.** Foi a escolha do v1 e ela era forçada. Continua sendo defensável para
um projeto de uma pessoa: staging é mais um ambiente para manter atualizado, e um staging
abandonado é pior que nenhum, porque dá falsa confiança. Se você perceber que não está
usando, desligue e assuma — é melhor que fingir que ele testa algo.

**Um segundo cluster para staging.** Isolamento de verdade: um erro em staging não pode
afetar produção de jeito nenhum. É a escolha certa a partir do segundo servidor.
Descartado porque no mesmo nó um segundo cluster k3s custaria outros 600 MiB de control
plane pelo isolamento que namespace e `PriorityClass` já dão em boa parte.

**PostgreSQL separado para staging.** Elimina o risco descrito em 3.2. Custa 2 GiB para
dado descartável. Revisitar se staging começar a rodar teste de carga — aí a instância
separada deixa de ser luxo.

**Preview environment por PR.** Um namespace efêmero por pull request. É o padrão em times
maiores e é genuinamente ótimo. Descartado por complexidade: exige DNS curinga, automação
de criação e destruição, e um banco por preview. Com um autor, o ganho sobre um staging
fixo é pequeno.

**Copiar produção para staging.** Descartado em 3.3, por privacidade. Se um dia houver
necessidade real de dado volumoso, o caminho é gerar volume sintético, não copiar o real.

## 5. Como garantir que está certo

```bash
# ☸️ cluster
kubectl -n staging get deploy,pod,ingress
kubectl -n staging get pod -o jsonpath="{range .items[*]}{.metadata.name}{'  '}{.spec.priorityClassName}{'\n'}{end}"
```

Esperado: `web` e `api` com 1 réplica, e `low` como `PriorityClass` em todos.

```bash
# 💻 local
curl -I https://staging.SEUDOMINIO.com/
```

Esperado: `401 Unauthorized` sem credencial. Se vier `200`, o basic auth não está aplicado
e você publicou um ambiente aberto.

O teste do isolamento de banco:

```bash
# ☸️ cluster
kubectl -n staging exec deploy/api -- \
  psql "$DATABASE_URL" -c "select count(*) from app.events;"
```

Esperado: **erro de permissão** ao tentar o schema de produção, e sucesso apenas em
`timeline_staging`. A role `staging_app` não deve enxergar o banco de produção.

O teste que prova que o overlay não virou cópia:

```bash
# 💻 local
diff <(kubectl kustomize deploy/overlays/prod) <(kubectl kustomize deploy/overlays/staging) | head -60
```

Esperado: as diferenças da tabela de 3.2, e nada além. Toda linha diferente que não está
na tabela é divergência não intencional.

E o teste de despejo, que é o exercício de quebrar coisa de propósito do
[`00-convencoes.md`](00-convencoes.md): crie um pod que consuma memória até a pressão
subir e confirme que o kubelet despeja o staging **antes** de qualquer coisa em `prod`.
Vale fazer uma vez, com calma, para confiar no mecanismo.

## 6. Armadilhas comuns

**Staging divergindo de produção.** A causa raiz é sempre copiar em vez de fazer overlay.
O sintoma é "passou em staging e quebrou em produção", que destrói a confiança no ambiente.

**Staging consumindo conexões do Postgres de produção.** Descrito em 3.2. Sintoma:
`FATAL: sorry, too many clients already` em produção, causado por um teste em staging.

**Dado de produção copiado "só desta vez".** Descrito em 3.3. Uma vez copiado, o dado está
lá — e o backup de staging passa a conter dado pessoal também.

**Staging sem autenticação.** Descrito em 3.4.

**Alertas de staging acordando você.** Configure as regras para separar por namespace.
Alerta de staging vai para um canal que você lê quando quiser, não para o que toca o
celular. Alerta que acorda à toa é alerta que você aprende a ignorar.

**Chave de LLM de produção usada em staging.** O orçamento de produção some testando
prompt. A chave própria de 3.2 existe para isso.

## 7. Para estudar

- 🆓 [Kustomize — bases e overlays](https://kubectl.docs.kubernetes.io/guides/config_management/introduction/)
- 🆓 [Kubernetes — Pod Priority and Preemption](https://kubernetes.io/docs/concepts/scheduling-eviction/pod-priority-preemption/)
- 🆓 [Kubernetes — Resource Quotas](https://kubernetes.io/docs/concepts/policy/resource-quotas/) — uma `ResourceQuota` no namespace `staging` é a rede que impede um erro de digitação de pedir 8 GiB.
- 🆓 [ANPD — guia de anonimização](https://www.gov.br/anpd/pt-br) — o que conta como anonimizado de verdade.
