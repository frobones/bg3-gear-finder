"""Serve the gear finder on this machine, telling the browser never to cache its files.

Python's plain http.server sends no caching headers, so browsers keep old scripts and data
after a change and a hard refresh doesn't always replace them. This sends Cache-Control: no-store.

    python3 scripts/serve.py    # then open http://localhost:8642
"""

import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOST = "127.0.0.1"
PORT = 8642


class NoCacheHandler(SimpleHTTPRequestHandler):
    """Static file handler that marks every response as not to be stored."""

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> None:
    """Serve the project folder on localhost until stopped with Ctrl+C."""
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    with ThreadingHTTPServer((HOST, PORT), handler) as server:
        print(f"Serving {ROOT} at http://localhost:{PORT} (Ctrl+C to stop)")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("Stopped.")


if __name__ == "__main__":
    main()
