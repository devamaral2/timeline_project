"""Measure the deployed worker using a reviewed manifest; reports contain metrics, not speech.

Optional `baseline` text on each case comes from the old browser recognizer on the SAME audio.
Audio and reference files stay local; only audio is sent to the explicitly supplied own service.
"""
import argparse
from collections import Counter
import json
import os
from pathlib import Path
import re
import time
import urllib.request
import uuid


def words(text):
    return re.findall(r"\w+", text.casefold())


def errors(reference, prediction):
    a, b = words(reference), words(prediction)
    row = list(range(len(b) + 1))
    for i, word in enumerate(a, 1):
        previous, row = row, [i]
        for j, other in enumerate(b, 1):
            row.append(min(row[-1] + 1, previous[j] + 1, previous[j-1] + (word != other)))
    return row[-1]


def metrics(case, text):
    normalized = " ".join(words(text))
    def repetitions(value):
        tokens = words(value)
        return Counter(zip(tokens, tokens[1:], tokens[2:]))
    actual, expected = repetitions(text), repetitions(case["reference"])
    return {
        "wordErrors": errors(case["reference"], text),
        "referenceWords": len(words(case["reference"])),
        "criticalCorrect": sum(any(" ".join(words(alias)) in normalized for alias in alternatives) for alternatives in case.get("critical", [])),
        "criticalTotal": len(case.get("critical", [])),
        "unexpectedRepeatedTrigrams": sum(max(0, count - max(1, expected[gram])) for gram, count in actual.items()),
        "silenceHallucination": not case["reference"].strip() and bool(text.strip()),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--url", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    secret = os.environ["AUDIO_TRANSCRIPTION_KEY"]
    headers = {"Authorization": f"Bearer {secret}", "X-Transcription-User": "quality-evaluation"}
    cases = json.loads(args.manifest.read_text())
    reports = []
    for case in cases:
        path = args.manifest.parent / case["file"]
        mime = {".wav": "audio/wav", ".webm": "audio/webm", ".mp4": "audio/mp4", ".m4a": "audio/mp4", ".ogg": "audio/ogg"}[path.suffix]
        url = f"{args.url.rstrip('/')}/v1/transcriptions/{uuid.uuid4()}"
        start = time.monotonic()
        request = urllib.request.Request(url, data=path.read_bytes(), headers={**headers, "Content-Type": mime}, method="POST")
        with urllib.request.urlopen(request, timeout=30) as response: result = json.load(response)
        while result["status"] in ("pending", "processing"):
            if time.monotonic() - start > 180: raise TimeoutError(case["id"])
            time.sleep(.25)
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=10) as response: result = json.load(response)
        latency = time.monotonic() - start
        report = {"id": case["id"], "source": case.get("source", "human"), "status": result["status"], "error": result.get("error"), "latencySeconds": round(latency, 3), **metrics(case, result.get("text", ""))}
        if "baseline" in case: report["baseline"] = metrics(case, case["baseline"])
        reports.append(report)
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers, method="DELETE"), timeout=10): pass
    total_words = sum(row["referenceWords"] for row in reports)
    result = {"wordErrorRate": sum(row["wordErrors"] for row in reports) / max(1, total_words), "cases": reports}
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"Wrote {len(reports)} evaluation results to {args.output}")


if __name__ == "__main__": main()
