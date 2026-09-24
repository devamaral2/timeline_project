# Transcrição própria do chat

Browser → Next → Auth → API → worker Python. O browser grava com MediaRecorder;
apenas o resultado final é enviado ao chat. O worker usa faster-whisper 1.2.1,
Whisper large-v3 FP16 em CUDA e Silero VAD incluído na versão da biblioteca.
Pesos: `Systran/faster-whisper-large-v3@edaa852ec7e145841d8ffdb056a99866b5f0a478`.
O arquivo `requirements.txt` fixa dependências transitivas e hashes (Python 3.12).

## Subir e ativar

Dimensionamento inicial: GPU NVIDIA com 16 GB de VRAM, 4 CPUs e 8 GB de RAM para
o container, driver compatível com CUDA 12.8 e NVIDIA Container Toolkit. Isso é
uma configuração inicial, não uma promessa de precisão/latência. Não há fallback
automático para CPU, modelo menor, API externa ou SpeechRecognition no chat.

Na raiz, disponibilize um segredo aleatório de pelo menos 32 caracteres em
`AUDIO_TRANSCRIPTION_KEY` e execute:

```sh
docker compose -f infra/docker-compose.transcription.yml up -d --build
```

O build baixa os pesos na revisão fixa; o runtime trabalha offline. A porta 8001
é publicada apenas no loopback. Se a API roda em outro container/host, configure
rede privada e endereço alcançável; não publique o worker na internet.

Na API configure `AUDIO_TRANSCRIPTION_URL`, `AUDIO_TRANSCRIPTION_KEY` e, **após
validar**, `AUDIO_TRANSCRIPTION_ENABLED=true`. O padrão é desativado. O carregador
1Password aceita essas chaves opcionais no escopo api-runtime e overrides locais.
O browser consulta capabilities em runtime; não precisa reconstruir o web.
Rollback: desative a chave e reinicie a API. Novos uploads ficam indisponíveis.

Use **um processo/worker Uvicorn e uma réplica**. O armazenamento é em memória:
reinício/expiração responde 404 e o usuário pode reenviar o Blob retido na aba.
Não há banco, Redis, arquivos de áudio persistentes nem logs de transcrições.
Áudio bruto é liberado após processamento; resultados/tombstones expiram em dez
minutos, com limpeza periódica. Há até quatro trabalhos ativos globalmente, um
por usuário e 128 resultados/tombstones. Saturação responde 429. Cancelar uma
inferência já em GPU descarta o resultado, mas não interrompe o kernel em curso.

## Contrato HTTP

- `GET /api/audio/transcriptions/capabilities`: `{ enabled }`, autenticado.
- `POST /api/audio/transcriptions`: corpo **binário** (não JSON/multipart),
  Content-Type audio/webm, audio/mp4, audio/ogg ou audio/wav e `X-Recording-Id` UUID.
  Responde 202 com `{ id, status }`. Máximo 20 MiB, 120s após decodificação.
- `GET /api/audio/transcriptions/:id`: pending, processing, completed (text e
  durationSeconds), failed (error) ou cancelled. Apenas o próprio usuário.
- `DELETE /api/audio/transcriptions/:id`: cancela e cria tombstone mesmo se o
  upload ainda estiver chegando. Todos os resultados usam Cache-Control no-store.

IDs e digest do áudio impedem repetição do trabalho durante o TTL. Mesmo ID com
outros bytes responde 409; falha transitória permite repetir com o mesmo áudio.
Falhas de validação não são repetidas automaticamente. O cliente preserva o Blob
até sucesso, descarte ou saída da página. A transcrição nunca cria registros.
O limite existente do chat é 4.000 caracteres: textos maiores ficam no campo
para reduzir, sem corte silencioso e sem envio parcial.

## Testes e avaliação

```sh
python3.12 -m venv /tmp/braid-audio-test
/tmp/braid-audio-test/bin/pip install --require-hashes -r services/transcription/requirements.txt
PYTHONPATH=services/transcription /tmp/braid-audio-test/bin/python -m unittest discover -s services/transcription/tests -v
pnpm test:ai apps/web/src/lib/speech apps/api/src/features/transcribe-audio apps/auth/src/http/api-proxy/audio-upload.test.ts
E2E_TRANSCRIPTION_PYTHON=/tmp/braid-audio-test/bin/python pnpm test:e2e:ai
```

E2E usa Web/Auth/API/worker reais e substitui só a inferência GPU por resultado
determinístico. Não representa teste de qualidade. A CI também valida o worker.

Corpus sintético de smoke test (requer espeak-ng e ffmpeg):

```sh
python services/transcription/evaluation/generate_smoke.py /tmp/braid-audio-smoke
python services/transcription/evaluation/evaluate.py /tmp/braid-audio-smoke/manifest.json --url http://127.0.0.1:8001 --output /tmp/braid-audio-report.json
```

`evaluation/cases.json` define casos de português, nomes, números, datas, pausas,
voz baixa, ruído, silêncio e repetição legítima. Para aprovação, grave também
falas **humanas** espontâneas nesses cenários, com amostras de 30s e 120s; crie um
manifesto local com `file`, `reference`, `critical` (listas de alternativas
aceitas) e `baseline` opcional (texto do reconhecimento antigo no mesmo áudio).
Revise as referências à mão. Não versione gravações pessoais nem seus textos.

O avaliador mede WER, acertos críticos, trigramas repetidos inesperados, texto
inventado no silêncio e latência. Relatórios não incluem transcrições. Compare
os mesmos áudios entre motores e as mesmas frases entre dispositivos. A medição
do nível vem de Web Audio; as configurações efetivamente aceitas são retornadas
por `getSettings()` no hook para inspeção/testes, sem guardar deviceId em logs.

Gate de ativação: nenhuma duplicação de mensagem ou fala cortada na matriz;
nenhum texto no silêncio; WER menor e acertos críticos pelo menos iguais ao
baseline humano. Metas iniciais de p95 após parar: até 10s para áudio de 30s e
30s para áudio de 120s, com modelo carregado e um usuário; medir também fila
com quatro trabalhos. Não foram verificadas apenas pelos testes automatizados.

Matriz manual pendente: Chrome/Edge desktop, Chrome Android, Safari iPhone;
microfone interno e Bluetooth; permissão negada; bloquear tela/trocar aba;
desconectar microfone; perder conexão no upload/polling; cancelar; trocar conta
ou conversa; começar novamente. Guardar resultados por browser/modelo/hardware.
O app nativo e o botão legado de criar evento por voz não mudam nesta entrega.
