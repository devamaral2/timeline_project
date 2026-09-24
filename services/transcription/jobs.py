"""Bounded, user-scoped, ephemeral jobs. No audio or transcript is logged."""
from dataclasses import dataclass, field
from hashlib import sha256
import json
import logging
import threading
import time

TTL_SECONDS = 600
MAX_ACTIVE = 4
MAX_JOBS = 128


class JobError(Exception):
    def __init__(self, status: int):
        self.status = status


class AudioError(Exception):
    def __init__(self, code: str):
        self.code = code


@dataclass
class Job:
    id: str
    user: str
    created: float
    digest: str = ""
    audio: bytes = field(default=b"", repr=False)
    status: str = "pending"
    text: str = field(default="", repr=False)
    duration: float = 0
    error: str = ""

    def result(self):
        result = {"id": self.id, "status": self.status}
        if self.status == "completed":
            result.update(text=self.text, durationSeconds=self.duration)
        if self.status == "failed":
            result["error"] = self.error
        return result


class Jobs:
    def __init__(self, transcribe, *, clock=time.monotonic, model_version="test"):
        self.transcribe = transcribe
        self.clock = clock
        self.model_version = model_version
        self.items = {}
        self.lock = threading.Condition()
        self.running = None
        self.closed = False
        self.thread = None

    def prune(self):
        for key, job in list(self.items.items()):
            if self.clock() - job.created >= TTL_SECONDS:
                job.audio = b""
                job.text = ""
                del self.items[key]

    def submit(self, user, id, audio):
        digest = sha256(audio).hexdigest()
        with self.lock:
            self.prune()
            key = (user, id)
            previous = self.items.get(key)
            if previous:
                if previous.status == "cancelled":
                    return previous.result()
                if previous.digest != digest:
                    raise JobError(409)
                if previous.status != "failed" or previous.error != "transcription_failed":
                    return previous.result()
            active = [j for j in self.items.values() if j.status in ("pending", "processing")]
            if any(j.user == user for j in active) or len(active) + int(self.running is not None and self.running not in active) >= MAX_ACTIVE:
                raise JobError(429)
            if len(self.items) >= MAX_JOBS and not previous:
                raise JobError(429)
            job = Job(id=id, user=user, created=self.clock(), digest=digest, audio=audio)
            self.items[key] = job
            self.lock.notify_all()
            return job.result()

    def get(self, user, id):
        with self.lock:
            self.prune()
            job = self.items.get((user, id))
            if not job:
                raise JobError(404)
            return job.result()

    def cancel(self, user, id):
        with self.lock:
            self.prune()
            job = self.items.get((user, id))
            if not job:
                # A DELETE can overtake an upload. Tombstones prevent later submission.
                if len(self.items) >= MAX_JOBS:
                    raise JobError(429)
                job = Job(id=id, user=user, created=self.clock())
                self.items[(user, id)] = job
            job.status, job.audio, job.text = "cancelled", b"", ""
            return job.result()

    def run_one(self):
        with self.lock:
            self.prune()
            job = next((j for j in self.items.values() if j.status == "pending"), None)
            if not job:
                return False
            job.status = "processing"
            audio, job.audio = job.audio, b""
            self.running = job
        started = self.clock()
        duration, text, error = 0, "", ""
        try:
            text, duration = self.transcribe(audio)
            if not text.strip():
                raise AudioError("no_speech")
        except AudioError as failure:
            error = failure.code
        except Exception:
            error = "transcription_failed"
        finally:
            audio = b""
        with self.lock:
            self.running = None
            self.prune()
            if self.items.get((job.user, job.id)) is job and job.status != "cancelled":
                job.status = "failed" if error else "completed"
                job.text, job.duration, job.error = text if not error else "", duration, error
        logging.info(json.dumps({
            "event": "transcription", "model": self.model_version,
            "durationSeconds": duration, "latencySeconds": round(self.clock() - started, 3),
            "status": job.status, "error": error or None,
        }))
        return True

    def start(self):
        def loop():
            while not self.closed:
                if not self.run_one():
                    with self.lock:
                        # Check under the condition lock to avoid losing an upload notification.
                        if not self.closed and not any(j.status == "pending" for j in self.items.values()):
                            self.lock.wait(timeout=30)
        self.thread = threading.Thread(target=loop, daemon=True)
        self.thread.start()

    def close(self):
        with self.lock:
            self.closed = True
            for job in self.items.values():
                job.status, job.audio, job.text = "cancelled", b"", ""
            self.items.clear()
            self.lock.notify_all()
