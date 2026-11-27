# Serviço local de transcrição

Roda no computador de casa, como serviço do usuário no systemd, e transcreve os vídeos do YouTube que a
Leitura diária pediu (spec #39). A VPS só guarda o pedido e chama o Claude Haiku; baixar o vídeo e transcrever
é aqui, onde há placa de vídeo e a internet de casa que o YouTube não bloqueia.

```text
VPS (API)                                         computador de casa (este app)
  pedido na fila ◄── POST /api/transcription-worker/next ──── busca, um por vez
                 ◄── POST …/lease (etapa + %) ───────────────  renova o lease enquanto trabalha
                 ◄── POST …/deliver (resultado ou falha) ────  entrega
  Haiku formata → documento na Leitura diária
```

Nenhuma porta é aberta na sua rede: o serviço só faz requisições para a VPS, com a chave de dispositivo
(`Authorization: Bearer bdk_…`), que só vale nessas três rotas e pode ser revogada.

## O que ele faz por pedido

1. Lê os metadados com o `yt-dlp`. Vídeo acima de **4 h** falha com `too_large`, antes de baixar.
2. Baixa só o áudio, com teto de **500 MB** (`too_large` se passar). Fica em cache pelo id do vídeo; um pedido de
   um vídeo que já está no cache não baixa de novo.
3. Texto: usa a **legenda feita por alguém** no idioma do vídeo, quando existe; senão, transcreve com o
   **whisper.cpp** (Vulkan, `large-v3-turbo` comprimido). A legenda automática do YouTube nunca é usada. Se o
   YouTube não informa o idioma do vídeo, o Whisper decide (não dá para saber se a legenda é do que se fala).
4. Separa os falantes pela voz com o **pyannote**, no processador, e casa cada fala com um falante pelo tempo
   (`Falante 1`, `Falante 2`, na ordem em que aparecem). Se a separação falha, tudo vai como `Falante 1` e o
   pedido segue.
5. Do gráfico de mais assistidos, descarta os 5% iniciais, junta trechos vizinhos com nota ≥ 0,6 e fica com até 3
   picos. Vídeo sem o gráfico simplesmente não tem a seção.
6. Lê os 50 comentários de primeiro nível mais recentes. Sem comentários (ou desligados, ou erro), segue sem eles.
7. Entrega à API. A falha sempre leva um código fechado (`too_large`, `private`, `unavailable`, `no_audio`,
   `failed`); a mensagem crua do `yt-dlp` só aparece no log.

Um pedido que o serviço pegou e não entregou (computador desligado, serviço parado, lease perdido) **volta para
a fila** quando o lease de 5 minutos vence. Entrega que falha por rede é repetida (5 s, 20 s, 60 s); sem
sucesso, o pedido volta à fila do mesmo jeito.

Ao subir, o serviço atualiza o `yt-dlp` e limpa o cache; depois limpa uma vez por dia. Áudio com mais de 7 dias
é apagado.

## Instalar

Nada disto vem com o repositório. Faça uma vez, no computador de casa.

### 1. yt-dlp e ffmpeg

O `yt-dlp` do gerenciador de pacotes (`/usr/bin/yt-dlp`) não se atualiza sozinho. Use o binário oficial, que
aceita `yt-dlp -U`:

```bash
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ~/.local/bin/yt-dlp
chmod +x ~/.local/bin/yt-dlp
```

O `ffmpeg` (`/usr/bin/ffmpeg`) converte o áudio para o whisper.cpp e o pyannote. Se preferir manter o `yt-dlp`
do sistema, troque o comando de atualização (`TRANSCRIBER_YTDLP_UPDATE`).

### 2. whisper.cpp com Vulkan e o modelo comprimido

```bash
# Dependências de compilação (Arch): git cmake vulkan-headers vulkan-icd-loader shaderc, mais o driver
# Vulkan da placa (vulkan-radeon, no caso da AMD).
git clone https://github.com/ggml-org/whisper.cpp ~/src/whisper.cpp
cd ~/src/whisper.cpp
cmake -B build -DGGML_VULKAN=1 -DBUILD_SHARED_LIBS=OFF
cmake --build build -j --config Release
install -m 755 build/bin/whisper-cli ~/.local/bin/whisper-cli

mkdir -p ~/.local/share/braid-transcriber/models
curl -L -o ~/.local/share/braid-transcriber/models/ggml-large-v3-turbo-q5_0.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
```

Teste na mão com um áudio curto antes de ligar o serviço:
`whisper-cli -m ~/.local/share/braid-transcriber/models/ggml-large-v3-turbo-q5_0.bin -f amostra.wav -l pt`
(a saída deve citar o dispositivo Vulkan).

### 3. pyannote (separação de falantes)

```bash
python3 -m venv ~/.local/share/braid-transcriber/venv
~/.local/share/braid-transcriber/venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
~/.local/share/braid-transcriber/venv/bin/pip install pyannote.audio
```

O modelo é gated: crie uma conta no Hugging Face, aceite os termos de
`pyannote/speaker-diarization-3.1` e `pyannote/segmentation-3.0`, gere um token de leitura e guarde-o no
1Password como `HF_TOKEN`. O script `python/diarize.py` roda no processador (`CUDA_VISIBLE_DEVICES` vazio).

### 4. A chave de dispositivo e o 1Password

No lugar onde o Auth tem acesso ao banco (a VPS ou uma worktree):

```bash
pnpm --filter @repo/auth run device-key -- issue --email SEU_EMAIL --label "pc de casa"
```

A saída traz `key=bdk_…` uma única vez. No Environment do 1Password, crie:

| Variável | Valor |
| --- | --- |
| `TRANSCRIBER_DEVICE_KEY` | a chave `bdk_…` |
| `TRANSCRIBER_API_URL` | o endereço público do gateway (o `AUTH_PUBLIC_URL`, ex.: `https://auth.seudominio`) |
| `HF_TOKEN` | o token do Hugging Face (pyannote) |

O serviço lê isso pelo carregador do projeto, no escopo `transcriber-runtime` (`scripts/onepassword/loader.mjs`),
sem escrever nenhuma chave em arquivo. Revogar: `… device-key -- revoke --id <keyId>`; vale no pedido seguinte.

### 5. Ligar o serviço

```bash
pnpm install
pnpm --filter @repo/transcriber run build

mkdir -p ~/.config/systemd/user ~/.config/braid-transcriber
cp apps/transcriber/ops/braid-transcriber.service ~/.config/systemd/user/

# Só o token do carregador (não é a chave de dispositivo); o arquivo é só seu.
umask 077
cat > ~/.config/braid-transcriber/op.env <<'ENV'
OP_SERVICE_ACCOUNT_TOKEN=...
OP_ENVIRONMENT_ID=...
ENV

# Confere o 1Password e as variáveis antes de ligar:
ONEPASSWORD_SCOPE=transcriber-runtime pnpm secrets:check

systemctl --user daemon-reload
systemctl --user enable --now braid-transcriber
```

`enable` faz o serviço subir sozinho quando você entra na sessão. Se o checkout não está em
`~/Documents/projects/timeline_project`, ajuste `WorkingDirectory` na unidade. Depois de um `git pull`, rode o
build de novo e `systemctl --user restart braid-transcriber`.

## Logs

```bash
journalctl --user -u braid-transcriber -f
```

Uma linha por fato, em português, com o id do pedido: o que foi reservado, cada etapa, o que falhou e por quê
(com o erro do `yt-dlp` ou do whisper.cpp, que não vai à API), o que a API respondeu à entrega, o cache limpo.
A chave de dispositivo nunca é registrada.

## Configuração

Tudo é variável de ambiente; o que está em negrito é obrigatório (vem do 1Password).

| Variável | Padrão | Para quê |
| --- | --- | --- |
| **`TRANSCRIBER_API_URL`** | | Endereço do gateway |
| **`TRANSCRIBER_DEVICE_KEY`** | | Chave de dispositivo (`bdk_…`) |
| `TRANSCRIBER_MAX_DURATION_HOURS` | `4` | Teto de duração do vídeo |
| `TRANSCRIBER_MAX_AUDIO_MB` | `500` | Teto de tamanho do áudio |
| `TRANSCRIBER_CACHE_DIR` | `~/.cache/braid-transcriber` | Pasta do cache de áudio |
| `TRANSCRIBER_CACHE_DAYS` | `7` | Quanto o áudio fica no cache |
| `TRANSCRIBER_POLL_SECONDS` | `30` | Intervalo entre buscas com a fila vazia |
| `TRANSCRIBER_YTDLP_BIN` | `yt-dlp` | Binário do yt-dlp |
| `TRANSCRIBER_YTDLP_UPDATE` | `yt-dlp -U` | Comando que atualiza o yt-dlp ao subir |
| `TRANSCRIBER_YTDLP_ARGS` | | Argumentos para todo yt-dlp (cookies, proxy) |
| `TRANSCRIBER_FFMPEG_BIN` | `ffmpeg` | Binário do ffmpeg |
| `TRANSCRIBER_WHISPER_BIN` | `whisper-cli` | Binário do whisper.cpp |
| `TRANSCRIBER_WHISPER_MODEL` | `~/.local/share/braid-transcriber/models/ggml-large-v3-turbo-q5_0.bin` | Modelo |
| `TRANSCRIBER_WHISPER_ARGS` | | Argumentos extras do `whisper-cli` (ex.: `-t 8`) |
| `TRANSCRIBER_DIARIZE_PYTHON` | `~/.local/share/braid-transcriber/venv/bin/python` | Python com o pyannote |
| `TRANSCRIBER_DIARIZE_MODEL` | `pyannote/speaker-diarization-3.1` | Modelo do pyannote |
| `HF_TOKEN` | | Token do Hugging Face para o pyannote |

Para variáveis fora do 1Password, ponha `Environment=` na unidade.

## Desenvolvimento

O serviço fica pronto e testado com executores falsos: `yt-dlp`, whisper.cpp e pyannote ficam atrás das portas de
`src/ports.ts`, e as partes puras (escolha da fonte do texto, recusas, picos, falantes, comentários, cache,
lease) vivem em `src/pipeline/`, `src/cache/` e `src/process-request.ts`.

```bash
pnpm exec vitest run --project transcriber
pnpm --filter @repo/transcriber run typecheck
pnpm --filter @repo/transcriber run build
```

Rodar de verdade, no foreground, com o 1Password (processa a fila real: só com a chave emitida):
`pnpm transcriber:start`.
