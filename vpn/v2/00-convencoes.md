# 00 — Convenções da spec v2

## Objetivo

Definir como cada documento do v2 é estruturado e que notação é usada, incluindo o que
mudou agora que a plataforma é Kubernetes.

---

## Por que isso existe

O mesmo motivo do [v1](../docs/00-convencoes.md): documentação técnica falha ou virando
lista de comandos sem contexto, ou virando ensaio que nunca chega ao comando. O template
fixo força os dois lados a coexistirem.

O v2 acrescenta um motivo. Kubernetes tem mais abstrações entre você e o processo do que
o Compose tinha. Quando algo quebra, a diferença entre "eu entendo essa camada" e "eu
copiei esse YAML" fica muito maior. As seções 2 e 4 de cada fase existem para você não
acumular YAML que funciona sem saber por quê.

---

## O template de cada documento de fase

As mesmas sete seções do v1, na mesma ordem:

1. **Objetivo** — uma frase: o que existe no fim que não existia no começo.
2. **Por que isso existe** — o raciocínio, e o que acontece se você pular.
3. **Passo a passo** — os comandos, na ordem, cada bloco dizendo onde roda.
4. **Por que não fazer diferente** — as alternativas e **em que situação elas seriam a
   escolha certa**.
5. **Como garantir que está certo** — comando de verificação com **saída esperada**.
6. **Armadilhas comuns** — o que dá errado na prática, com a mensagem que aparece.
7. **Para estudar** — referências, marcadas com custo.

---

## Notação

| Marca | Significado |
| --- | --- |
| 💻 **local** | Comando roda na sua máquina Windows |
| 🖥️ **servidor** | Comando roda no VPS, via SSH |
| ☸️ **cluster** | Comando é `kubectl`/`flux`, roda de onde houver kubeconfig |
| ⚠️ | Passo que pode quebrar coisa — leia o parágrafo acima antes de executar |
| 🔒 | Item de segurança que também está no checklist consolidado |
| 🆓 / 💰 | Referência gratuita / paga |

Placeholders em MAIÚSCULA precisam ser substituídos: `app.SEUDOMINIO.com`, `SEU_IP`.

⚠️ marca comandos com pré-requisito ou risco. No v2 os principais são `ufw`,
`k3s-uninstall.sh`, qualquer `kubectl delete` em `pvc` e o corte de proxy da Fase 5.

---

## Glossário — o que o v2 acrescenta

O glossário do v1 continua valendo (container, imagem, registry, volume, reverse proxy,
OOM killer, heap, TLS, ADR). O que é novo:

**Pod** — a menor unidade que o Kubernetes agenda. Um ou mais containers que compartilham
rede e ciclo de vida. Na prática, aqui, quase sempre um container só.

**Deployment** — declara "quero N pods desta imagem". Cuida de criar, substituir e
reverter. É o objeto que dá o rolling update.

**StatefulSet** — como um Deployment, mas para quem tem identidade e disco próprios.
PostgreSQL e Redis usam isso; web e API não.

**Service** — nome DNS estável para um conjunto de pods. `postgres:5432` continua
funcionando como no Compose, mas agora porque existe um Service, não porque existe uma
rede Docker.

**Ingress** — a regra "este host e este caminho vão para este Service". O Traefik lê
Ingress no lugar das labels do Compose.

**requests e limits** — `requests` é o piso que o scheduler reserva; `limits` é o teto que
o kernel aplica. O v1 só tinha o teto (`mem_limit`). Esta distinção é a mais importante do
v2 e está detalhada em [`01-arquitetura-e-orcamento.md`](01-arquitetura-e-orcamento.md).

**QoS class** — consequência de requests e limits. `Guaranteed` (iguais) é o último a ser
despejado; `Burstable` (limit > request) vem depois; `BestEffort` (nenhum) é o primeiro.
É como se protege o banco.

**Probe** — `liveness` ("está vivo? se não, reinicie"), `readiness` ("pode receber
tráfego?") e `startup` ("ainda está subindo, não conte como morto"). O healthcheck do
Docker fazia o trabalho dos três, mal.

**NetworkPolicy** — firewall entre pods. Substitui o truque da rede `internal: true` do
v1 por uma regra explícita, com default-deny.

**PV / PVC / StorageClass** — o disco. `local-path` é o provisionador padrão do k3s: cria
um diretório no nó. Funciona bem com um nó só, e prende o volume a ele.

**Namespace** — divisória lógica do cluster. É o que dá staging sem segundo servidor.

**Helm / HelmRelease** — empacotamento de manifestos com valores parametrizáveis. O Flux
instala HelmRelease a partir do git.

**GitOps** — o estado desejado vive no git e um controlador dentro do cluster o aplica
continuamente. Inverte o deploy: em vez de o CI empurrar, o cluster puxa.

**Flux** — o controlador de GitOps escolhido. Também observa o GHCR e commita a nova tag
de imagem sozinho.

**SOPS / age** — criptografia de arquivo por chave. Deixa o secret versionado no git em
forma cifrada, decifrado só dentro do cluster.

**OTLP / span / trace** — o protocolo e as unidades do OpenTelemetry. Um *span* é uma
operação com início e fim; um *trace* é a árvore de spans de uma requisição inteira.

**LiteLLM** — proxy que expõe uma API compatível com OpenAI e roteia para vários
fornecedores, com orçamento, cache, fallback e métricas.

**Lane** — convenção nossa, não do LiteLLM: um nome de modelo por *tarefa*
(`event-parsing`), não por fornecedor. A aplicação pede a lane; qual modelo a atende é
configuração.

---

## Como usar esta spec para aprender

A recomendação do v1 continua: antes de cada fase leia só as seções 1, 2 e 4 e tente
responder *o que eu faria se tivesse que resolver isso sozinho?*; depois execute
entendendo cada comando; no fim faça a seção 5 prevendo a saída antes de olhar.

O v2 acrescenta um exercício que o Kubernetes torna barato e o Compose não tornava:

**Uma vez por fase, mate alguma coisa.** `kubectl delete pod` no web e cronometre até
voltar. Force um `OOMKilled` baixando o limite de um pod de teste. Aponte um Ingress para
um Service que não existe e leia o erro. `kubectl drain` o nó e veja o que acontece quando
só há um. Especialmente esse último: ele mostra, de um jeito que nenhum texto mostra, o
que Kubernetes **não** resolve com um servidor só.

---

## Sobre os documentos que não são de fase

[`01-arquitetura-e-orcamento.md`](01-arquitetura-e-orcamento.md),
[`14-seguranca-checklist.md`](14-seguranca-checklist.md),
[`15-runbook-operacao.md`](15-runbook-operacao.md) e
[`16-biblioteca-de-estudo.md`](16-biblioteca-de-estudo.md) são referências consultadas de
forma não-linear e têm a estrutura que faz sentido para seu uso.

As ADRs em [`adr/`](adr/) seguem o template curto: **Contexto → Decisão → Alternativas
consideradas → Consequências → Quando revisitar**. As que substituem uma decisão do v1
começam com uma linha `Supersede:` apontando o documento antigo.
