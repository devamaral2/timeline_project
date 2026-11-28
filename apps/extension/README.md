# Extensão do Chrome: Leitura diária

Um clique no ícone guarda a página aberta, em markdown, na tarefa **Leitura diária** de hoje.
Se a tarefa do dia ainda não existe, ela é criada junto com o documento, a fazer e marcada para as 18h.
Numa aba de vídeo do YouTube, o clique pede a transcrição do vídeo (veja "Vídeo do YouTube" abaixo).

## Instalar

```bash
pnpm --filter @repo/extension run build
```

1. Abra `chrome://extensions` e ligue o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e escolha a pasta `apps/extension/dist`.
3. A tela de opções abre sozinha. Escreva o endereço do app (o mesmo que você abre no navegador),
   salve e aceite o pedido de permissão do Chrome.
4. Entre no app nesse mesmo navegador, se ainda não entrou.

Depois de mudar o código, rode o build de novo (ou `pnpm --filter @repo/extension run watch`) e
clique em recarregar no cartão da extensão.

## Usar

Clique no ícone da extensão, ou use `Alt+Shift+L`, com a página aberta. O ícone mostra `✓` quando a
página foi guardada e `!` quando algo falhou, e um aviso na página diz o que aconteceu e leva à tarefa.

| Página | O que é guardado |
| --- | --- |
| Reportagem, artigo, post | O texto principal em markdown, sem menu, anúncio nem rodapé |
| Página sem texto principal | Só o endereço e a descrição da página |

### Vídeo do YouTube

Numa aba de vídeo do YouTube (`watch?v=`, `youtu.be/`, `shorts/`, `embed/` ou `live/`), o clique **não lê
a página**: manda só o endereço do vídeo para `POST /api/tasks/transcription-requests` e não pergunta nada.
O pedido entra na fila do serviço local de transcrição, e o documento do vídeo aparece na Leitura diária
com "Transcrição na fila" até o texto chegar. O aviso diz que o vídeo entrou na fila de transcrição e leva
à Leitura diária; o ícone mostra `✓`. Pedir de novo o mesmo vídeo no mesmo dia, enquanto o pedido espera,
devolve o pedido que já existe (o aviso diz "Este vídeo já está na fila").

Em outras páginas do YouTube (início, canal, busca, playlist) vale a regra das demais páginas.

Guardar a mesma página de novo no mesmo dia atualiza o documento dela em vez de criar outro. Toda página
guardada numa leitura que já existe a devolve para a fazer, mesmo que ela já estivesse concluída.

## Imagens e vídeos

Nada é baixado nem enviado como arquivo: imagens e vídeos entram no markdown como endereços.

- **Imagem**: `![texto alternativo](endereço)`, apontando para o original. O app só busca as
  imagens de um documento quando a pessoa toca em "Mostrar imagens", e sem `Referer`. Abrir um
  documento não avisa o servidor da imagem. Pixels de rastreio e imagens embutidas (`data:`) ficam de fora.
- **Vídeo do YouTube incorporado**: um link sozinho na linha, que vira o player oficial do
  YouTube (`youtube.com/embed`) no web e no Android.
- **Outros vídeos, áudios e molduras**: um link com o nome do que é ("Vídeo", "Áudio", "Vídeo no Vimeo").

Se o site tirar a imagem do ar, ela some do documento: o texto fica, a imagem não.

## Como funciona

- `src/background.ts`: o service worker. No clique, mostra o aviso do resultado de `src/save.ts`.
- `src/save.ts`: decide pelo endereço da aba. Vídeo do YouTube: pede a transcrição, sem ler a página.
  Outra página: injeta o leitor na aba e manda o resultado para `POST /api/tasks/daily-reading`.
- `src/capture/`: lê a página. `page.ts` escolhe o que guardar (o Readability, do modo de leitura do
  Firefox, acha o texto principal numa cópia do documento); `markdown.ts` converte para markdown com o
  Turndown e trata imagens, vídeos e links.
- `src/api.ts`: fala com o app em `/api/*`, na origem configurada, com os cookies de sessão que o
  navegador já guarda. Num 401, renova a sessão uma vez em `/api/session/refresh`.
- `src/options/`: a tela de opções, com o endereço do app.

A regra do que acontece com a página (achar ou criar a tarefa do dia, reconhecer a mesma página)
está na API, em `apps/api/src/features/save-daily-reading`.

## Permissões

- `activeTab` e `scripting`: ler a aba em que você clicou, e só ela, só depois do clique.
- `storage`: guardar o endereço do app.
- Acesso ao endereço do app, pedido quando você o salva nas opções. É ele que deixa a extensão usar
  a sessão aberta.

A extensão não guarda senha nem token e não lê histórico nem outras abas.

## Testes

```bash
pnpm exec vitest run --workspace vitest.workspace.ts --project extension
```

Os testes cobrem a leitura da página, o cliente da API e a escolha entre pedir a transcrição e guardar a página. O service worker usa as APIs `chrome.*` e
fica fora deles.
