---
status: accepted
date: 2026-11-08
supersedes: [0001, 0002, 0003]
---

# Skills e agentes do Hermes como arquivos numa pasta compartilhada

## Contexto

As ADRs 0001 a 0003 guardavam a configuração do agente da API no banco (instantâneos versionados) e
previam sincronizar isso com o Hermes. O volume do Hermes não pode ser aberto por dois containers, então a
sincronização nunca saiu do papel. Além disso, o agente da API que lia essa configuração (o chat legado
com `skills.json`, `prompts.json`, `agents.json` e `jev-routing.json`) foi removido: o fluxo de IA de hoje é
a rota por processo (ADR 003, agentes em `api-core/process/agents/*.md`) e o Hermes (ADR 004).

## Decisão

1. **A fonte é uma pasta**, `AGENT_FILES_DIR`, montada na API e no Hermes. As skills e os agentes do
   Hermes ficam em `hermes/skills/<nome>/SKILL.md` e `hermes/agents/<nome>.md`. Não há cópia no banco.
2. **O Hermes edita os arquivos.** A API só os lê (a cada 2 s, porque inotify não atravessa todo volume
   montado), registra o que mudou e disponibiliza leitura e restauração para o dono (ADR 0004).
3. **Backup por arquivo, para rollback.** Toda mudança (nova versão lida da pasta, ou restauração) guarda o
   texto anterior em `.backups/<caminho>/<UTC>.<hash>.bak`, com retenção (50 por arquivo). Restaurar um
   backup também guarda o texto que ele substituiu, então a restauração se desfaz.
4. **Arquivo apagado não perde o texto.** O último conteúdo conhecido continua guardado e pode ser
   restaurado.
5. **Notas apontam para os arquivos** (tipo `skill`/`agent`, com o caminho e o hash): é a referência para
   verificação, nunca o conteúdo. *Implementado*: o `AgentFileNotesReconciler` cria e atualiza uma nota por
   arquivo (só do dono, `AGENT_CONFIG_OWNER_USER_ID`) a cada leitura da pasta em que algo mudou; arquivo
   sumido marca a nota (`missing`) em vez de apagá-la. As notas não se editam nem se excluem pela API de
   notas: seguem o arquivo. O web mostra o caminho, a versão (hash) e o texto lido de
   `GET /api/ai/config/file`; o Android mostra caminho e versão.
6. **Pedido de edição pelo app** passa pelo Hermes: ele avalia o impacto, edita os arquivos e avisa se o
   pedido compromete o fluxo. *Implementado* em `POST /api/ai/config/edit-request` (só o dono; 404 com
   `AI_AUTOMATION` desligada), que envia o pedido pelo mesmo job da rota do Hermes. A resposta do Hermes
   aparece na nota; a nota se atualiza sozinha quando o hash muda (até 2 s depois da gravação).
   A tela de detalhe da skill/agente edita por outro caminho, sem o Hermes: ver a [ADR 0006](0006-edicao-por-alvo-pela-rota-por-processo.md).

## Consequências

- A edição é livre dentro da pasta: a API não valida o conteúdo dos arquivos do Hermes, só o isola (caminho
  dentro da pasta, apenas `.md`, até 256 KB). O rollback é o guarda.
- Os endpoints `api/ai/config` (listar, ler, backups, restaurar) passam a tratar só da pasta do
  Hermes. Publicar e restaurar o padrão de fábrica deixaram de existir.
- Só viram nota o `SKILL.md` de cada skill e os `.md` de `hermes/agents/`. O resto da pasta de skills
  (`DESCRIPTION.md`, referências, scripts, estado do Hermes como `.usage.json` e `.bundled_manifest`) pertence
  ao Hermes, fica na pasta mas a API o ignora (pastas ocultas também).
- Falta montar a pasta em produção (`ops/production/hermes.yaml`) e incluí-la no `ops/production/backup.sh`.

## Montagem no Hermes e migração

O Hermes só grava as skills que cria em `/opt/data/skills`, e `skills.external_dirs` é somente leitura. Por isso
`hermes/skills` da pasta compartilhada é montada **direto em `/opt/data/skills`** (a pasta inteira também vai em
`/opt/agent-files`, o caminho que o pedido de edição informa ao Hermes). Não há sincronização entre volume e pasta.

- A montagem esconde o que o volume `hermes-data` tinha em `/opt/data/skills`: antes de recriar o container,
  copie as skills para a pasta (`docker cp braid-hermes:/opt/data/skills/. ~/.braid/agent-files/hermes/skills/`).
  As cópias antigas continuam no volume, escondidas, e voltam se a montagem sair.
- O usuário do Hermes é remapeado para o uid/gid do dono da pasta (`HERMES_UID`/`HERMES_GID`, a partir de
  `AGENT_FILES_UID`/`AGENT_FILES_GID`, padrão 1000), senão ele não consegue gravar nela.
- O Hermes ressincroniza as skills embutidas na inicialização; elas passam a ser gravadas na pasta compartilhada
  e viram notas como as demais.
