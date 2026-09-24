import io
import time
import unittest
import wave
from fastapi.testclient import TestClient
from app import create_app, MAX_BYTES
from engine import decode
from jobs import AudioError

KEY = "test-key-" * 5
ID = "6099604e-d348-4599-b48d-9c7fc18ea929"
HEADERS = {"Authorization": f"Bearer {KEY}", "X-Transcription-User": "ana", "Content-Type": "audio/wav"}


def wav(seconds=1, channels=2, rate=48000):
    output = io.BytesIO()
    with wave.open(output, "wb") as file:
        file.setnchannels(channels)
        file.setsampwidth(2)
        file.setframerate(rate)
        file.writeframes(b"\x00\x00" * int(seconds * rate) * channels)
    return output.getvalue()


class ServiceTests(unittest.TestCase):
    def test_decodes_mp4_aac_from_safari(self):
        import av
        import numpy as np
        output = io.BytesIO()
        with av.open(output, mode="w", format="mp4") as container:
            stream = container.add_stream("aac", rate=48000)
            stream.layout = "mono"
            frame = av.AudioFrame.from_ndarray(np.zeros((1, 48000), dtype=np.float32), format="fltp", layout="mono")
            frame.sample_rate = 48000
            for packet in stream.encode(frame): container.mux(packet)
            for packet in stream.encode(None): container.mux(packet)
        self.assertTrue(16000 <= len(decode(output.getvalue())) < 18000)

    def test_decode_validates_actual_length_and_converts_to_mono_16k(self):
        self.assertEqual(len(decode(wav())), 16000)
        with self.assertRaises(AudioError) as error:
            decode(wav(121, channels=1, rate=16000))
        self.assertEqual(error.exception.code, "duration_exceeded")
        with self.assertRaises(AudioError) as error:
            decode(b"not audio")
        self.assertEqual(error.exception.code, "invalid_audio")
        with self.assertRaises(AudioError):
            decode(b"#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nhttp://127.0.0.1/private\n")

    def test_auth_size_type_and_async_result(self):
        calls = []
        def engine(audio):
            calls.append(audio)
            return "amanhã às nove", len(decode(audio)) / 16000
        with TestClient(create_app(engine, KEY)) as client:
            path = f"/v1/transcriptions/{ID}"
            self.assertEqual(client.post(path, content=wav()).status_code, 401)
            self.assertEqual(client.post(path, content=b"x", headers={**HEADERS, "Content-Type": "text/plain"}).status_code, 415)
            self.assertEqual(client.post(path, content=b"x", headers={**HEADERS, "Content-Length": str(MAX_BYTES + 1)}).status_code, 413)
            response = client.post(path, content=wav(), headers=HEADERS)
            self.assertEqual(response.status_code, 202)
            for _ in range(100):
                result = client.get(path, headers=HEADERS)
                if result.json()["status"] == "completed": break
                time.sleep(.01)
            self.assertEqual(result.json()["text"], "amanhã às nove")
            self.assertEqual(result.headers["cache-control"], "no-store")
            self.assertEqual(client.get(path, headers={**HEADERS, "X-Transcription-User": "bob"}).status_code, 404)
            self.assertEqual(client.post(path, content=wav(), headers=HEADERS).json()["status"], "completed")
            self.assertEqual(len(calls), 1)
            self.assertEqual(client.delete(path, headers=HEADERS).json()["status"], "cancelled")

if __name__ == "__main__": unittest.main()
