# Plano RepoScope

Stack: Python 3.11+ só com biblioteca padrão. Sobe sem instalar pacote.
Pasta do app: `cursor-sonnet/reposcope`. CLI `reposcope scan` e `serve`. API em `http.server`, histórico em SQLite.
Analisador: percorre a pasta sem seguir symlink, ignora `.git`, `node_modules`, `venv` e regras de `.gitignore`, conta arquivos e linhas, top 10 por tamanho, marcas TODO/FIXME/HACK e, se houver git, commits de 12 semanas e 5 autores.
API: `GET /api/health`, `GET /api/scan?path=`, `GET /api/history`. Raiz permitida = `REPOSCOPE_ROOT` ou o diretório de onde o servidor sobe. Caminho fora dela, inexistente ou sem permissão responde erro e não quebra.
Frontend estático no próprio backend. Identidade de instrumento óptico: esmalte `#16363C`, placa `#E4EEF0`, cádmio `#9E2B12`, tinta da lente `#0F766E`. Tipos: Sora, Atkinson Hyperlegible, Azeret Mono. Assinatura: visor de medição, com varredura só enquanto mede.
Gráficos em SVG: linha para linhas por linguagem, barras para commits por semana. Tabela de marcas ordenável e filtrável.
Testes `unittest` do analisador, da API e da CLI (mais de 8). Demonstração em `samples/` com git próprio.
Sem subagentes: um programa só, coeso; dividir custaria coordenação sem encurtar o caminho.
Validar com os testes, com a API no ar e com o painel aberto.
