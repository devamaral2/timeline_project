#!/usr/bin/env python3
"""Separa os falantes de um áudio com o pyannote, no processador.

Uso: diarize.py <audio.wav> [modelo]

Imprime no stdout uma lista JSON `[{"start": s, "end": s, "speaker": "SPEAKER_00"}]`
(tudo o mais vai para o stderr). O modelo do pyannote exige aceitar os termos na
página dele no Hugging Face e um token (variável HF_TOKEN, ou `huggingface-cli login`).
"""
import json
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print("uso: diarize.py <audio.wav> [modelo]", file=sys.stderr)
        return 2
    audio = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) > 2 else "pyannote/speaker-diarization-3.1"

    from pyannote.audio import Pipeline  # importado aqui para o erro de instalação sair legível

    pipeline = Pipeline.from_pretrained(model)
    if pipeline is None:
        print(f"não foi possível carregar o modelo {model} (termos aceitos? HF_TOKEN definido?)", file=sys.stderr)
        return 1
    result = pipeline(audio)
    # pyannote.audio 4.x devolve um objeto com `.speaker_diarization`; o 3.x, a anotação direto.
    annotation = getattr(result, "speaker_diarization", result)
    turns = [
        {"start": round(turn.start, 3), "end": round(turn.end, 3), "speaker": speaker}
        for turn, _, speaker in annotation.itertracks(yield_label=True)
    ]
    json.dump(turns, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
