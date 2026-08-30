# 00 — Convenções desta spec

## Objetivo

Definir como cada documento é estruturado, que notação é usada, e como você deve
consumir esta spec para aprender e não só executar.

---

## Por que isso existe

Documentação técnica falha de dois jeitos opostos. Ou vira uma lista de comandos sem
contexto — funciona uma vez, e você fica refém dela — ou vira um ensaio teórico que
nunca chega ao comando. Um template fixo força os dois lados a coexistirem em cada
página.

O template também resolve um problema seu específico: você vai voltar nestes documentos
daqui a seis meses tendo esquecido tudo. Uma estrutura previsível significa que você
sabe onde procurar sem reler o documento inteiro.

---

## O template de cada documento de fase

Todo documento numerado de fase tem exatamente estas seis seções, nesta ordem:

### 1. Objetivo
Uma frase: o que existe no final que não existia no começo. Se você não consegue
descrever assim, a fase está grande demais e deveria ser duas.

### 2. Por que isso existe
O raciocínio. Que problema real esse passo resolve, e o que acontece se você pular.
Esta é a seção que faz você entender em vez de decorar.

### 3. Passo a passo
Os comandos, na ordem. Cada bloco de comando vem com o que ele faz e onde é executado.

### 4. Por que não fazer diferente
As alternativas plausíveis e o motivo de terem sido descartadas — **incluindo em que
situação a alternativa seria a escolha certa**. Isso importa: as decisões aqui são boas
para 1 servidor de 4GB, e várias mudam de resposta com 3 servidores ou 32GB.

### 5. Como garantir que está certo
Comandos de verificação com **saída esperada**. Não "verifique se está funcionando",
mas "rode isto, você deve ver aquilo, e se vir outra coisa o problema é X".

### 6. Armadilhas comuns
O que dá errado na prática. Erros específicos com a mensagem que aparece.

### 7. Para estudar
Referências daquele assunto: docs oficiais, livros, vídeos. Marcadas com custo.

---

## Notação

| Marca            | Significado                                                |
| ---------------- | ---------------------------------------------------------- |
| 💻 **local**     | Comando roda na sua máquina Windows                        |
| 🖥️ **servidor** | Comando roda no VPS, via SSH                               |
| ⚠️               | Passo que pode quebrar coisa — leia antes de executar      |
| 🔒               | Item de segurança que também está no checklist consolidado |
| 🆓               | Referência gratuita                                        |
| 💰               | Referência paga                                            |

Blocos de comando sempre indicam onde rodam:

```bash
# 🖥️ servidor — como root
apt update
```

Placeholders em MAIÚSCULA precisam ser substituídos por você:

```bash
ssh SEU_USUARIO@SEU_IP
```

⚠️ Um comando marcado assim tem um pré-requisito ou um risco descrito logo acima dele.
Nunca execute um bloco ⚠️ sem ler o parágrafo anterior. Vários deles (`ufw enable`,
`k3s-uninstall.sh`) podem te trancar fora do servidor se executados fora de ordem.

---

## Glossário

Termos que aparecem em todo lugar e que vale fixar antes de começar.

**VPS** — Virtual Private Server. Uma fatia isolada de um servidor físico, com seu
próprio sistema operacional e acesso root. Diferente de hospedagem compartilhada
(onde você só coloca arquivos) e de VPN (que é túnel de rede, não hospedagem).

**Container** — um processo isolado do resto do sistema, com seu próprio sistema de
arquivos e rede, mas usando o kernel do host. Não é uma máquina virtual: é muito mais
leve porque não emula hardware nem roda um segundo kernel.

**Imagem** — o "molde" imutável de onde containers são criados. Uma imagem gera N
containers idênticos. Imagem é receita, container é o prato pronto.

**Registry** — onde imagens ficam armazenadas. Docker Hub é o público mais conhecido;
**GHCR** (GitHub Container Registry) é o do GitHub, que usaremos porque já vem integrado
às permissões do seu repositório.

**Volume** — armazenamento que sobrevive à morte do container. Sem volume, apagar o
container do Postgres apaga o banco. Este é o erro que mais dói.

**Reverse proxy** — o programa que recebe todas as requisições da internet e decide para
qual container interno mandar cada uma, baseado no domínio ou caminho. Aqui: Traefik.

**Monorepo** — um repositório git contendo vários projetos relacionados, com dependências
compartilhadas entre eles.

**Workspace** — no pnpm, cada projeto dentro do monorepo. Declarados em
`pnpm-workspace.yaml`.

**Orquestrador** — o que decide quais containers rodam, onde, e o que fazer quando um
morre. Docker Compose é o mais simples; Kubernetes é o mais completo.

**OOM Killer** — o mecanismo do Linux que mata processos quando a memória acaba. Ele
escolhe a vítima por heurística, não por importância — por isso ele mata seu Postgres
em vez do processo que causou o problema. É o vilão recorrente desta spec.

**Heap** — a memória que o Node.js usa para objetos. O V8 tem um limite próprio
(`--max-old-space-size`) independente do limite do container, e alinhar os dois é o
que evita mortes silenciosas.

**TLS / SSL** — a criptografia por trás do HTTPS. "SSL" é o nome antigo, ainda usado
por costume. Certificado é o arquivo que prova que você é dono do domínio.

**Let's Encrypt** — autoridade certificadora gratuita que emite certificados TLS
automaticamente. Tem rate limits agressivos — daí o ambiente de staging.

**ADR** — Architecture Decision Record. Documento curto registrando uma decisão técnica,
o contexto dela e as alternativas descartadas. Serve para o "por que diabos eu fiz assim"
de daqui a um ano.

---

## Como usar esta spec para aprender (e não só executar)

Uma sugestão concreta, porque "estude os conceitos" não ajuda ninguém:

**Antes de cada fase**, leia só as seções 1, 2 e 4 (Objetivo, Por que existe, Por que não
fazer diferente). Não olhe os comandos ainda. Tente responder: *o que eu faria se
tivesse que resolver isso sozinho?*

**Durante**, execute os comandos entendendo cada um. Quando encontrar um comando que
você não sabe o que faz, `man COMANDO` ou pesquise antes de rodar. Especialmente os
marcados ⚠️.

**Depois**, faça a seção 5 (verificação) sem olhar a resposta esperada primeiro. Preveja
a saída, depois compare. Onde você errou a previsão é exatamente onde seu modelo mental
está furado.

**Uma vez por fase**, quebre alguma coisa de propósito num ambiente seguro. Pare o
Postgres e veja como a app reage. Encha o disco num container de teste. A intuição
operacional vem de ver o sistema falhar, não de ver ele funcionar.

---

## Sobre os documentos que não são de fase

`01-arquitetura-e-orcamento.md`, `11-seguranca-checklist.md`, `12-runbook-operacao.md`
e `13-biblioteca-de-estudo.md` não seguem o template de sete seções — são referências
consultadas de forma não-linear, e cada um tem a estrutura que faz sentido para seu uso.

As ADRs em `adr/` seguem um template próprio e mais curto: **Contexto → Decisão →
Alternativas consideradas → Consequências → Quando revisitar**.
