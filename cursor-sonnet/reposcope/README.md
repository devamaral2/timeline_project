# RepoScope

RepoScope lê uma pasta local e mostra a saúde do código: arquivos e linhas por linguagem, os maiores arquivos, marcas `TODO` / `FIXME` / `HACK` e, quando a pasta é um repositório git, os commits das últimas 12 semanas.

Python 3.11 ou mais novo, só com a biblioteca padrão. Não há pacote para instalar.

## Executar o painel

Na pasta deste projeto:

```bash
python3 -m reposcope serve
```

O mesmo comando, pelo atalho:

```bash
./bin/reposcope serve
```

Abra `http://127.0.0.1:8765`, deixe `samples` no campo e escolha **Medir**.

A raiz permitida é o diretório de onde o servidor foi iniciado, ou a pasta em `REPOSCOPE_ROOT`. Um caminho fora dessa raiz é recusado.

```bash
REPOSCOPE_ROOT="$HOME" python3 -m reposcope serve --port 8765
```

## Linha de comando

```bash
./bin/reposcope scan samples --format json
./bin/reposcope scan samples --format md
./bin/reposcope scan samples --format md --output leitura.md
```

`--root` limita a pasta permitida, do mesmo modo que a API. Sem `--root` e sem `REPOSCOPE_ROOT`, a CLI aceita qualquer pasta legível que você informar.

## Testes

```bash
python3 -m unittest discover -s tests -v
```

## O que a leitura faz

- Ignora `.git`, `node_modules`, `venv`, `.venv` e pastas de build.
- Aplica `.gitignore` com comentários, negação, `*`, `?`, `**`, âncora `/` e barra final de diretório.
- Não segue symlink.
- Se `git` não existir ou a pasta não for um repositório, o restante da leitura continua e o bloco de commits explica a ausência.
- Cada leitura da API fica em `data/history.sqlite`. `GET /api/history` devolve as últimas 20. `GET /api/health` responde `{"ok": true}`.

## Amostra

`samples/` é uma pasta pequena, com um repositório git próprio, marcas visíveis e arquivos que o analisador deve ignorar (`secrets.env`, `debug.log`, `node_modules`).

## Identidade

O painel é um instrumento de leitura, não um painel genérico. O visor em torno do campo da pasta é a peça central: os quatro traços marcam o enquadramento e uma linha varre o visor só enquanto a medição acontece.

| Nome | Uso | Hex |
| --- | --- | --- |
| Esmalte | fundo do corpo | `#16363C` |
| Placa | superfície de leitura | `#E4EEF0` |
| Tinta | texto sobre a placa | `#122226` |
| Lente | gráficos e traços do visor | `#0F766E` |
| Cádmio | botão Medir, FIXME e erro | `#9E2B12` |

Tipografia: Sora nos títulos e nos números, Atkinson Hyperlegible no texto, Azeret Mono nos caminhos e rótulos. Se a rede não carregar as fontes, o painel usa Trebuchet MS, Verdana e um mono do sistema.

Tema claro e escuro ficam no botão do topo. Em largura de 375px o visor, os números e os gráficos empilham.
