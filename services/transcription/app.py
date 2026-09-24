import asyncio
from contextlib import asynccontextmanager
import hmac
import logging
import os
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from jobs import Jobs, JobError

MAX_BYTES = 20 * 1024 * 1024
AUDIO_TYPES = {"audio/webm", "audio/mp4", "audio/ogg", "audio/wav"}


def create_app(transcribe=None, key=None):
    secret = key if key is not None else os.environ.get("AUDIO_TRANSCRIPTION_KEY", "")
    if len(secret) < 32:
        raise RuntimeError("AUDIO_TRANSCRIPTION_KEY must have at least 32 characters")

    @asynccontextmanager
    async def lifespan(app):
        from engine import Engine, MODEL_REVISION
        engine = transcribe if transcribe is not None else Engine()
        # All instances must use ONE process; the in-memory store is deliberately ephemeral.
        app.state.jobs = Jobs(engine, model_version=f"large-v3@{MODEL_REVISION}")
        app.state.jobs.start()
        yield
        app.state.jobs.close()

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    def identity(authorization: str = Header(default=""), x_transcription_user: str = Header(default="")):
        if not hmac.compare_digest(authorization.encode(), f"Bearer {secret}".encode()):
            raise HTTPException(401)
        if not x_transcription_user or len(x_transcription_user) > 384:
            raise HTTPException(400)
        return x_transcription_user

    @app.middleware("http")
    async def private_response(request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(JobError)
    async def job_error(request, error):
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "job_request_failed"}, status_code=error.status)

    @app.get("/health")
    def health():
        return {"ready": hasattr(app.state, "jobs")}

    @app.post("/v1/transcriptions/{id}", status_code=202)
    async def upload(id: UUID, request: Request, user=Depends(identity)):
        if request.headers.get("content-type", "").split(";")[0].strip() not in AUDIO_TYPES:
            raise HTTPException(415)
        length = request.headers.get("content-length")
        if length and (not length.isdecimal() or int(length) > MAX_BYTES):
            raise HTTPException(413)
        data = bytearray()
        try:
            async with asyncio.timeout(25):
                async for chunk in request.stream():
                    if len(data) + len(chunk) > MAX_BYTES:
                        raise HTTPException(413)
                    data.extend(chunk)
        except TimeoutError:
            raise HTTPException(408) from None
        if not data:
            raise HTTPException(400)
        return app.state.jobs.submit(user, str(id), bytes(data))

    @app.get("/v1/transcriptions/{id}")
    def get(id: UUID, user=Depends(identity)):
        return app.state.jobs.get(user, str(id))

    @app.delete("/v1/transcriptions/{id}")
    def cancel(id: UUID, user=Depends(identity)):
        return app.state.jobs.cancel(user, str(id))

    return app


logging.basicConfig(level=logging.INFO, format="%(message)s")
# Library diagnostics are not application telemetry; suppress accidental content logging.
logging.getLogger("faster_whisper").setLevel(logging.ERROR)
