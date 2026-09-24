"""Reproducible synthetic smoke audio. NOT evidence of quality on human speech.

Run from root: python services/transcription/evaluation/generate_smoke.py OUTPUT_DIR
Requires espeak-ng and ffmpeg; never records the user's microphone.
"""
import array
import json
from pathlib import Path
import random
import subprocess
import sys
import tempfile
import wave

source = Path(__file__).with_name("cases.json")
output = Path(sys.argv[1])
output.mkdir(parents=True, exist_ok=True)
cases = json.loads(source.read_text())
with tempfile.TemporaryDirectory() as temporary:
    for case in cases:
        wav = Path(temporary) / "speech.wav"
        if case["id"] == "silence":
            with wave.open(str(wav), "wb") as file:
                file.setparams((1, 2, 22050, 0, "NONE", "not compressed"))
                file.writeframes(b"\0\0" * 22050 * 3)
        else:
            subprocess.run(["espeak-ng", "-v", "pt-br", "-s", "145", "-w", str(wav), case["reference"]], check=True)
            with wave.open(str(wav), "rb") as file:
                params = file.getparams()
                samples = array.array("h", file.readframes(file.getnframes()))
            if case["id"] == "quiet":
                samples = array.array("h", (int(value * .1) for value in samples))
            if case["id"] == "noise":
                rng = random.Random(42)
                samples = array.array("h", (max(-32768, min(32767, value + rng.randint(-1000, 1000))) for value in samples))
            if case["id"] == "pause":
                # Long pause at a known punctuation boundary, generated as two utterances.
                parts = []
                for text in ["Anote uma tarefa.", "Comprar pão amanhã."]:
                    subprocess.run(["espeak-ng", "-v", "pt-br", "-s", "145", "-w", str(wav), text], check=True)
                    with wave.open(str(wav), "rb") as file:
                        parts.append(array.array("h", file.readframes(file.getnframes())))
                samples = parts[0] + array.array("h", [0] * params.framerate * 4) + parts[1]
            with wave.open(str(wav), "wb") as file:
                file.setparams(params)
                file.writeframes(samples.tobytes())
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-c:a", "libopus", "-b:a", "128k", str(output / case["file"])], check=True)
        case["source"] = "synthetic-espeak-ng-not-a-human-quality-benchmark"
(output / "manifest.json").write_text(json.dumps(cases, ensure_ascii=False, indent=2))
print(f"Generated {len(cases)} synthetic smoke recordings in {output}")
