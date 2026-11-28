# Fichas de notícias, de resumo de e-mail e de transcrição

Notícias (`news`), Resumo de e-mail (`email_summary`) e Transcrição (`youtube_transcript`) continuam
guardando um texto em markdown (`{ body }`), que a pessoa lê e edita como nota. No detalhe do artefato,
quando o texto tem títulos, a tela o mostra em **fichas**: os números no topo e um cartão por item. Um
texto sem título nenhum aparece como o markdown de sempre. Dentro da tarefa, onde o artefato já é um
cartão, fica o markdown.

A nota (`text`) que a Leitura diária guarda de um vídeo do YouTube também sai em fichas, lida como
transcrição: é a que abre com a linha `Fonte:` de um vídeo do YouTube e tem trechos marcados
(`{#t-125}`). Enquanto a transcrição não chega (ou quando ela falha), o documento do vídeo não tem
trecho nenhum e segue como nota; a página de texto lida e a nota comum também. O tipo do artefato não
muda: quem decide é `summaryCardsTypeOf`.

Nada novo é guardado: as fichas são uma leitura do texto. Quem escreve é o agente, pelo MCP
(`create_artifact`, `update_artifact`), e a descrição do campo `body` traz este formato.

## Formato

```markdown
Uma abertura de um parágrafo.

## Pedem resposta

### Documentos do imposto
De: Marina Costa · 09:12
Faltam o informe do banco e o recibo do aluguel.
Prazo: hoje, 18h

[Responder](https://mail.example.com/t/1)

## Para saber

- **Banco Prisma:** a fatura de novembro fechou.
- [Entrega a caminho](https://loja.example.com/pedido/9): chega na segunda.
```

- **Abertura**: o que vem antes do primeiro título vira o primeiro cartão.
- **Grupo**: cada título do nível mais alto do texto (em geral `##`). Um título sozinho na primeira
  linha é o nome do texto e não conta.
- **Ficha**: dentro de um grupo, cada título do nível seguinte (`###`) é um cartão. Um grupo sem
  subtítulos e sem lista vira um cartão só, com o título dentro (na transcrição, um cartão de texto com
  o título como rótulo do grupo).
- **Linhas**: um grupo que é só uma lista vira um cartão de linhas. `**Negrito:** texto` separa o
  título do apoio; `[texto](endereço): apoio` faz da linha um link. Passou de 5 linhas, as demais ficam
  atrás de "Mostrar todas".
- **Campos da ficha**, uma linha cada, que saem do texto:
  - `De: nome · detalhe`: o remetente, com as iniciais no disco e o detalhe (a hora) em mono;
  - `Prazo: texto`: o prazo, com o relógio. O tom vem do texto: "hoje" e "agora" em âmbar, "atrasado",
    "vencido" e "ontem" em vermelho, o resto apagado;
  - `Fonte:` ou `Fontes: [nome](endereço) · [nome](endereço)`: as etiquetas de fonte. Sem ação na
    ficha, um botão abre a primeira fonte.
- **Ações**: um parágrafo feito só de links (`[Responder](endereço) · [Abrir o anexo](endereço)`) vira
  os botões do pé da ficha. Só a primeira ação da primeira ficha da tela é preenchida.
- **Endereços**: só `http(s)` (e `mailto:` nas ações) vira link; o resto fica como texto.

### Notícias

O grupo é a editoria e vai para dentro de cada ficha, no lugar do rótulo do grupo; a primeira notícia
abre em letra maior, na serifa.

```markdown
## Economia

### Conta de luz fica mais barata em dezembro
A bandeira tarifária passa a verde.

Fontes: [Folha do Vale](https://…) · [Portal Lume](https://…)
```

### Transcrição

É o mesmo documento que a transcrição da Leitura diária monta
(`apps/api/src/features/format-transcription/transcription-document.ts`), com as âncoras de
`docs/markdown-anchors.md`:

```markdown
Fonte: [YouTube](https://www.youtube.com/watch?v=ID) · Canal

## Resumo
- [O sono pesa mais que o treino](#t-190) (03:10): o músculo se refaz dormindo.

## Momentos mais assistidos
- [12:40–13:05](#t-705): o corpo confere se você apareceu na hora de sempre.

## Comentários
O que o público achou.

## Transcrição
{#t-190} [03:10](https://youtu.be/ID?t=190) **Paula:** O músculo se refaz dormindo.
```

- A linha `Fonte:` de um vídeo do YouTube vira o player, com o canal embaixo.
- Uma lista em que toda linha abre com um intervalo (`12:40–13:05`) ganha a linha do vídeo com cada
  intervalo no lugar. O documento traz só os intervalos, não a curva de audiência.
- O grupo que tem trechos marcados (`{#t-…}`) é a transcrição: fica recolhido atrás de "Ler a
  transcrição". Um link para um trecho (`#t-190`) abre a transcrição e rola até ele.
- Um texto de grupo com mais de 700 caracteres (a descrição do vídeo) abre recolhido.

## Números do topo

Saem do próprio texto, então nunca discordam dele; aparecem quando há pelo menos dois.

| Tipo | Números |
|---|---|
| Resumo de e-mail | total de itens ("e-mails"); itens do primeiro grupo, com o nome dele; quantos vencem hoje, ou quantos têm prazo, ou os itens do segundo grupo |
| Notícias | fichas ("assuntos"); fontes diferentes; minutos de leitura (200 palavras por minuto) |
| Transcrição | minutos (até o último trecho marcado); pessoas que falam; partes (linhas da primeira lista) |

## Onde está no código

- Web: `apps/web/src/lib/notes/summary-cards.ts` (a leitura e `summaryCardsTypeOf`, que diz o que é lido
  em fichas), `components/notes/SummaryCards.tsx` e
  `summary-cards.module.css` (a tela), `ArtifactContent.tsx` (quando usar).
- Android: `domain/markdown/SummaryCards.kt` (a leitura, conferida com a fixture `summary-cards`) e
  `ui/documents/SummaryCardsView.kt` (a tela).
- MCP: a descrição do campo `body` em `apps/mcp/src/tools.ts`.
