# Extensão do Chrome: Leitura diária

Um clique no ícone guarda a página aberta, em markdown, na tarefa **Leitura diária** de hoje.
Se a tarefa do dia ainda não existe, ela é criada junto com o documento, a fazer e marcada para as 18h.

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
| Vídeo do YouTube | O link do vídeo, que o app mostra como player, e a descrição |
| Página sem texto principal | Só o endereço e a descrição da página |

Guardar a mesma página de novo no mesmo dia atualiza o documento dela em vez de criar outro. Toda página
guardada numa leitura que já existe a devolve para a fazer, mesmo que ela já estivesse concluída.

## Imagens e vídeos

Nada é baixado nem enviado como arquivo: imagens e vídeos entram no markdown como endereços.

- **Imagem**: `![texto alternativo](endereço)`, apontando para o original. O app só busca as
  imagens de um documento quando a pessoa toca em "Mostrar imagens", e sem `Referer`. Abrir um
  documento não avisa o servidor da imagem. Pixels de rastreio e imagens embutidas (`data:`) ficam de fora.
- **Vídeo do YouTube incorporado**: um link sozinho na linha. No web ele vira o player
  (`youtube-nocookie.com`); no Android, um cartão que abre o YouTube.
- **Outros vídeos, áudios e molduras**: um link com o nome do que é ("Vídeo", "Áudio", "Vídeo no Vimeo").

Se o site tirar a imagem do ar, ela some do documento: o texto fica, a imagem não.

## Como funciona

- `src/background.ts`: o service worker. No clique, injeta o leitor na aba, manda o resultado para
  `POST /api/tasks/daily-reading` e mostra o aviso.
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

Os testes cobrem a leitura da página e o cliente da API. O service worker usa as APIs `chrome.*` e
fica fora deles.
