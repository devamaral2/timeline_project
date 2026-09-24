import threading
import unittest
from jobs import Jobs, JobError, AudioError, TTL_SECONDS


class JobTests(unittest.TestCase):
    def test_upload_retry_and_result_are_scoped_and_idempotent(self):
        calls = []
        jobs = Jobs(lambda audio: (calls.append(audio) or "não, não", 2))
        jobs.submit("ana", "id", b"audio")
        jobs.submit("ana", "id", b"audio")
        with self.assertRaises(JobError) as error:
            jobs.get("bob", "id")
        self.assertEqual(error.exception.status, 404)
        with self.assertRaises(JobError) as error:
            jobs.submit("ana", "id", b"different")
        self.assertEqual(error.exception.status, 409)
        self.assertTrue(jobs.run_one())
        self.assertFalse(jobs.run_one())
        self.assertEqual(jobs.submit("ana", "id", b"audio")["text"], "não, não")
        self.assertEqual(calls, [b"audio"])
        self.assertEqual(jobs.items[("ana", "id")].audio, b"")

    def test_cancel_before_upload_and_during_inference(self):
        jobs = Jobs(lambda _: (jobs.cancel("ana", "active") and "late", 1))
        jobs.cancel("ana", "future")
        self.assertEqual(jobs.submit("ana", "future", b"audio")["status"], "cancelled")
        jobs.submit("ana", "active", b"audio")
        jobs.run_one()
        self.assertEqual(jobs.get("ana", "active"), {"id": "active", "status": "cancelled"})

    def test_expiry_and_restart_allow_original_recording_to_be_reuploaded(self):
        now = [0]
        jobs = Jobs(lambda _: ("texto", 1), clock=lambda: now[0])
        jobs.submit("ana", "id", b"audio")
        jobs.run_one()
        now[0] = TTL_SECONDS
        with self.assertRaises(JobError):
            jobs.get("ana", "id")
        self.assertEqual(jobs.submit("ana", "id", b"audio")["status"], "pending")
        restarted = Jobs(lambda _: ("texto", 1))
        with self.assertRaises(JobError):
            restarted.get("ana", "id")

    def test_no_speech_and_transient_failure(self):
        def failed(_):
            raise AudioError("no_speech")
        jobs = Jobs(failed)
        jobs.submit("ana", "id", b"audio")
        jobs.run_one()
        self.assertEqual(jobs.get("ana", "id")["error"], "no_speech")
        self.assertEqual(jobs.submit("ana", "id", b"audio")["status"], "failed")
        def unavailable(_):
            raise RuntimeError("potentially sensitive text")
        jobs = Jobs(unavailable)
        jobs.submit("ana", "id", b"audio")
        jobs.run_one()
        self.assertEqual(jobs.get("ana", "id")["error"], "transcription_failed")
        self.assertEqual(jobs.submit("ana", "id", b"audio")["status"], "pending")

    def test_concurrent_uploads_run_once_and_queue_is_bounded(self):
        jobs = Jobs(lambda _: ("text", 1))
        threads = [threading.Thread(target=lambda: jobs.submit("ana", "id", b"same")) for _ in range(10)]
        for thread in threads: thread.start()
        for thread in threads: thread.join()
        self.assertEqual(len(jobs.items), 1)
        with self.assertRaises(JobError) as error:
            jobs.submit("ana", "second", b"audio")
        self.assertEqual(error.exception.status, 429)
        for i in range(3): jobs.submit(str(i), "id", b"audio")
        with self.assertRaises(JobError) as error:
            jobs.submit("other", "id", b"audio")
        self.assertEqual(error.exception.status, 429)

    def test_logs_do_not_include_content(self):
        jobs = Jobs(lambda _: ("private transcript", 3), model_version="large-v3@revision")
        jobs.submit("private user", "private id", b"private audio")
        with self.assertLogs(level="INFO") as logs:
            jobs.run_one()
        self.assertNotIn("private", " ".join(logs.output))
        self.assertIn("large-v3@revision", " ".join(logs.output))

if __name__ == "__main__": unittest.main()
