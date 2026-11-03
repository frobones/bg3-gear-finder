"""Tests for scripts/serve.py: every response tells the browser not to cache it."""

import io
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import serve  # noqa: E402 -- scripts/ is not a package; path is set up above


def written_headers(status: int) -> str:
    """The header block the handler writes for a response, captured without opening a socket."""
    handler = serve.NoCacheHandler.__new__(serve.NoCacheHandler)
    handler.request_version = "HTTP/1.1"
    handler.requestline = "GET /index.html HTTP/1.1"
    handler.wfile = io.BytesIO()
    handler.log_request = lambda *args: None  # keep test output quiet
    handler.send_response(status)
    handler.end_headers()
    return handler.wfile.getvalue().decode("latin-1")


class NoCacheHandlerTest(unittest.TestCase):
    def test_responses_say_no_store(self) -> None:
        self.assertIn("Cache-Control: no-store\r\n", written_headers(200))

    def test_error_responses_also_say_no_store(self) -> None:
        self.assertIn("Cache-Control: no-store\r\n", written_headers(404))

    def test_serves_the_project_folder(self) -> None:
        self.assertTrue((serve.ROOT / "index.html").is_file())


if __name__ == "__main__":
    unittest.main()
