"""Decode locally, without shell commands, URLs or unbounded decoded buffers."""
import io
import os

from jobs import AudioError

MODEL_REPOSITORY = "Systran/faster-whisper-large-v3"
MODEL_REVISION = "edaa852ec7e145841d8ffdb056a99866b5f0a478"
SAMPLE_RATE = 16000
MAX_SECONDS = 120


def decode(audio):
    import av
    import numpy as np
    frames, size = [], 0
    try:
        with av.open(io.BytesIO(audio), options={
            "format_whitelist": "wav,matroska,webm,mov,mp4,m4a,3gp,3g2,mj2,ogg",
            "protocol_whitelist": "pipe",
        }) as container:
            if not container.streams.audio:
                raise AudioError("invalid_audio")
            resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
            def collect(frame):
                nonlocal size
                for converted in resampler.resample(frame):
                    values = converted.to_ndarray().flatten()
                    size += values.size
                    if size > SAMPLE_RATE * MAX_SECONDS:
                        raise AudioError("duration_exceeded")
                    frames.append(values)
            for frame in container.decode(audio=0):
                collect(frame)
            collect(None)
    except AudioError:
        raise
    except Exception:
        raise AudioError("invalid_audio") from None
    if not size:
        raise AudioError("invalid_audio")
    return np.concatenate(frames).astype(np.float32) / 32768.0


class Engine:
    def __init__(self):
        from faster_whisper import WhisperModel
        # Downloaded with a pinned revision during image build; never resolve main at runtime.
        self.model = WhisperModel(os.environ.get("MODEL_PATH", "/models/large-v3"),
                                  device="cuda", compute_type="float16", local_files_only=True)
        # Warm up the bundled/versioned Silero model as well.
        from faster_whisper.vad import get_vad_model
        get_vad_model()

    def __call__(self, audio):
        samples = decode(audio)
        segments, _ = self.model.transcribe(
            samples, language="pt", task="transcribe", beam_size=5,
            condition_on_previous_text=False, vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 2000, "speech_pad_ms": 400},
        )
        text = " ".join(segment.text.strip() for segment in segments).strip()
        if len(text) > 16000:
            raise AudioError("transcription_failed")
        return text, len(samples) / SAMPLE_RATE
