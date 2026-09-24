"""Real worker HTTP/jobs/decoder, with only GPU inference replaced for deterministic E2E."""
import os
import time
import uvicorn
from app import create_app
from engine import decode


def fake_inference(audio):
    duration = len(decode(audio)) / 16000
    time.sleep(1)
    return ("não, não, amanhã às nove" if duration > .35 else ""), duration


uvicorn.run(create_app(fake_inference), host="127.0.0.1", port=int(os.environ["TRANSCRIPTION_PORT"]), access_log=False)
