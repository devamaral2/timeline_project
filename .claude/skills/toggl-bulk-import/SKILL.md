---
name: toggl-bulk-import
description: Importa em massa, para o Firestore deste projeto (timeline_project), os eventos descritos em um PDF de relatório detalhado do Toggl Track (páginas com DESCRIPTION/DURATION/MEMBER alternadas com páginas PROJECT/TAGS/TIME|DATE). Use esta skill sempre que o usuário anexar ou mencionar um PDF do Toggl, um "relatório detalhado", ou pedir para importar/inserir/popular eventos de rotina, alimentação, treino ou sono no banco a partir de um arquivo de horas rastreadas — mesmo que ele não diga explicitamente "Firestore" ou "bulk". Restrita a este projeto: só deve ser usada dentro do repositório timeline_project, nunca para inserir dados em outro banco Firebase.
---

# Importação em massa de eventos a partir de PDF do Toggl

Esta skill lê um PDF de relatório detalhado do Toggl Track, extrai cada entrada de
tempo, decide se ela é `routine`, `food`, `training` ou `sleep`, e grava tudo no
Firestore (collection `events`) usando um script Node autocontido que já sabe ler as
credenciais do Admin SDK em `.env.local` deste projeto.

Antes de tocar em qualquer campo — PDF, JSON, classificação — leia
[references/schema-and-classification.md](references/schema-and-classification.md).
Ele documenta como as páginas do PDF se correspondem, a ordem de prioridade para
classificar o tipo, o formato exato do payload JSON e os valores padrão de `data`
por tipo. Sem isso você vai adivinhar campos e o Firestore (ou o app depois) vai
rejeitar ou renderizar besteira.

## Por que existe um script em vez de escrever direto

Gravar no Firestore em massa é uma ação sobre um banco de dados real e compartilhado
— não é reversível com um Ctrl+Z. O script (`scripts/bulk-import-events.mjs`)
existe para tornar isso seguro e repetível:

- Tem um modo `--dry-run` que valida e mostra um resumo sem fazer nenhuma chamada
  de rede — sempre rode esse modo primeiro e mostre o resumo ao usuário antes de
  gravar de verdade.
- Calcula o fuso horário (`America/Sao_Paulo`) exatamente como o app faz em
  `src/lib/timeline/format-date.ts`, então você só precisa extrair o horário local
  de parede do PDF, sem fazer conta de fuso na mão.
- Gera IDs determinísticos (hash de userId+type+startedAt+name), então rodar o
  mesmo arquivo de novo depois de corrigir um erro sobrescreve o mesmo documento em
  vez de duplicar.
- Se o Firestore rejeitar um evento, o script cai para escrita individual daquele
  lote e reporta exatamente qual evento e por quê — isso é o gancho para você
  corrigir `buildDefaultData()` genericamente (ver seção "Se algo for rejeitado").

## Fluxo

1. **Leia o PDF** (ferramenta `Read` já extrai o texto de PDFs). Para cada par de
   páginas, uma linha da tabela ímpar + a linha de mesmo número na tabela par formam
   um evento completo.
2. **Classifique o tipo de cada linha** seguindo a ordem de prioridade do arquivo de
   referência (tag primeiro, descrição só como fallback, `routine` como padrão).
3. **Monte o JSON** no formato descrito na referência e salve num arquivo temporário
   (pode usar o diretório de scratch da sessão).
4. **Rode em dry-run primeiro**:
   ```bash
   node .claude/skills/toggl-bulk-import/scripts/bulk-import-events.mjs --input <arquivo.json> --dry-run
   ```
   Mostre o resumo (contagem por tipo, intervalo de datas, tags únicas, eventuais
   erros de validação) ao usuário. **Peça confirmação explícita antes do próximo
   passo** — gravar dezenas de eventos reais no banco de produção do usuário é uma
   ação que precisa de aprovação, não algo para rodar silenciosamente.
5. **Depois da confirmação**, rode sem `--dry-run`, passando `--user-email` (o
   e-mail do usuário Firebase Auth dono dos eventos — pergunte se não tiver certeza
   de qual é, não assuma) ou `--user-id` se já tiver o UID:
   ```bash
   node .claude/skills/toggl-bulk-import/scripts/bulk-import-events.mjs --input <arquivo.json> --user-email amaral.avelar.filo@gmail.com
   ```
6. **Reporte o resultado** ao usuário: quantos eventos entraram, quantos falharam e
   por quê.

## Se algo for rejeitado

O requisito deste projeto é que **qualquer tipo de evento** (routine, food, training
ou sleep) deva poder ser criado por esta skill, mesmo quando o PDF só dá
nome/tipo/início/fim/tags. Se o Firestore rejeitar um evento por falta de campo:

1. Leia a mensagem de erro que o script imprime (ela nomeia o evento e o motivo).
2. Corrija `buildDefaultData()` em `scripts/bulk-import-events.mjs` **para aquele
   tipo em geral** — não crie um `if` especial só para o nome daquele evento.
3. Rode o mesmo comando de novo (sem `--dry-run`). Como os IDs são determinísticos,
   os eventos que já tinham sido gravados com sucesso são apenas reescritos com o
   mesmo conteúdo — não duplicam.

## Fora do escopo desta skill

Não use esta skill para criar um único evento avulso (isso é uma tela normal do
app) nem para importar de qualquer fonte que não seja um relatório do Toggl Track
neste formato de página par/ímpar. Se o formato do PDF vier diferente (colunas
diferentes, sem separação em duas páginas), pare e avise o usuário em vez de
adivinhar o mapeamento de colunas.
