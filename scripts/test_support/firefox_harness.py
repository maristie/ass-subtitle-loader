"""Small Firefox/Marionette lifecycle shared by the browser test runners."""

import base64
import json
import shutil
import socket
import subprocess
import sys
import threading
import time
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


DEFAULT_HOST = "127.0.0.1"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format, *args):
        return


class QuietHTTPServer(ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        error = sys.exc_info()[1]
        if isinstance(error, (BrokenPipeError, ConnectionAbortedError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)


@contextmanager
def serve_directory(root, port, host=DEFAULT_HOST):
    """Serve a directory until the surrounding test context exits."""
    handler = partial(QuietHandler, directory=str(root))
    server = QuietHTTPServer((host, port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://{host}:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


class Marionette:
    def __init__(self, host, port, socket_timeout=60):
        self.sock = socket.create_connection((host, port), timeout=10)
        self.sock.settimeout(socket_timeout)
        self.buffer = b""
        self.next_id = 0
        self.hello = self._read_packet()

    def close(self):
        self.sock.close()

    def command(self, name, params=None):
        msg_id = self.next_id
        self.next_id += 1
        self._write_packet([0, msg_id, name, params or {}])
        while True:
            packet = self._read_packet()
            if isinstance(packet, list) and len(packet) == 4 and packet[0] == 1 and packet[1] == msg_id:
                error = packet[2]
                result = packet[3]
                if error:
                    raise RuntimeError(f"{name} failed: {json.dumps(error, indent=2)}")
                if isinstance(result, dict) and set(result.keys()) == {"value"}:
                    return result["value"]
                return result

    def _read_packet(self):
        while b":" not in self.buffer:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise EOFError("socket closed before packet header")
            self.buffer += chunk
        length_text, self.buffer = self.buffer.split(b":", 1)
        length = int(length_text)
        while len(self.buffer) < length:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise EOFError("socket closed before packet body")
            self.buffer += chunk
        body = self.buffer[:length]
        self.buffer = self.buffer[length:]
        return json.loads(body.decode("utf-8"))

    def _write_packet(self, payload):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.sock.sendall(str(len(body)).encode("ascii") + b":" + body)


def default_firefox_bin():
    macos = Path("/Applications/Firefox.app/Contents/MacOS/firefox")
    if macos.exists():
        return str(macos)
    return shutil.which("firefox") or "firefox"


def get_available_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((DEFAULT_HOST, 0))
        return sock.getsockname()[1]


def write_profile(profile_dir, marionette_port):
    user_js = Path(profile_dir) / "user.js"
    user_js.write_text(
        "\n".join(
            [
                'user_pref("marionette.enabled", true);',
                f'user_pref("marionette.port", {marionette_port});',
                'user_pref("browser.shell.checkDefaultBrowser", false);',
                'user_pref("browser.startup.homepage_override.mstone", "ignore");',
                'user_pref("browser.sessionstore.resume_from_crash", false);',
                'user_pref("browser.warnOnQuit", false);',
                'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
                'user_pref("full-screen-api.allow-trusted-requests-only", false);',
                'user_pref("media.block-autoplay-until-in-foreground", false);',
                'user_pref("media.suspend-bkgnd-video.enabled", false);',
                'user_pref("media.autoplay.default", 0);',
                'user_pref("media.autoplay.blocking_policy", 0);',
                "",
            ]
        ),
        encoding="utf-8",
    )


def launch_firefox(
    firefox_bin,
    profile_dir,
    marionette_port,
    headed,
    allow_system_access=False,
):
    write_profile(profile_dir, marionette_port)
    command = [firefox_bin, "--marionette"]
    if allow_system_access:
        command.append("-remote-allow-system-access")
    command.extend(["--no-remote", "--profile", str(profile_dir), "about:blank"])
    if not headed:
        command.insert(1, "--headless")
    return subprocess.Popen(
        command,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def wait_for_marionette(port, process, timeout=30, host=DEFAULT_HOST):
    deadline = time.monotonic() + timeout
    last_error = None
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"Firefox exited before Marionette was ready: {process.returncode}")
        try:
            with socket.create_connection((host, port), timeout=0.25):
                return
        except OSError as error:
            last_error = error
            time.sleep(0.1)
    raise TimeoutError(f"Timed out waiting for Marionette on port {port}: {last_error}")


def ignore_marionette_error(client, name, params):
    try:
        return client.command(name, params)
    except Exception:
        return None


def new_session(
    client,
    script_timeout=30000,
    page_load_timeout=30000,
    implicit_timeout=0,
    window_width=1280,
    window_height=900,
):
    result = client.command(
        "WebDriver:NewSession",
        {
            "capabilities": {
                "alwaysMatch": {
                    "acceptInsecureCerts": True,
                }
            }
        },
    )
    ignore_marionette_error(
        client,
        "WebDriver:SetTimeouts",
        {
            "script": script_timeout,
            "pageLoad": page_load_timeout,
            "implicit": implicit_timeout,
        },
    )
    ignore_marionette_error(
        client,
        "WebDriver:SetWindowRect",
        {
            "width": window_width,
            "height": window_height,
        },
    )
    client.command("Marionette:SetContext", {"value": "content"})
    return result


def navigate(client, url):
    client.command("Marionette:SetContext", {"value": "content"})
    client.command("WebDriver:Navigate", {"url": url})


def execute_async(client, script, args=None, timeout=None):
    if timeout is not None:
        ignore_marionette_error(client, "WebDriver:SetTimeouts", {"script": timeout})
    params = {
        "script": script,
        "args": args or [],
    }
    if timeout is not None:
        params["scriptTimeout"] = timeout
    return client.command("WebDriver:ExecuteAsyncScript", params)


def save_screenshot(client, path):
    Path(path).write_bytes(take_screenshot_png(client))


def take_screenshot_png(client):
    return base64.b64decode(client.command("WebDriver:TakeScreenshot", {}))


def terminate_process(process):
    if not process or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


@contextmanager
def firefox_session(
    firefox_bin,
    profile_dir,
    marionette_port,
    headed=False,
    allow_system_access=False,
    socket_timeout=60,
    startup_timeout=30,
    script_timeout=30000,
    page_load_timeout=30000,
    implicit_timeout=0,
    window_width=1280,
    window_height=900,
):
    """Own a Firefox process, Marionette connection, and WebDriver session."""
    process = launch_firefox(
        firefox_bin,
        profile_dir,
        marionette_port,
        headed,
        allow_system_access=allow_system_access,
    )
    client = None
    try:
        wait_for_marionette(marionette_port, process, timeout=startup_timeout)
        deadline = time.monotonic() + startup_timeout
        while True:
            try:
                client = Marionette(DEFAULT_HOST, marionette_port, socket_timeout=socket_timeout)
                break
            except (ConnectionError, EOFError, OSError):
                if process.poll() is not None or time.monotonic() >= deadline:
                    raise RuntimeError("Firefox automation handshake failed") from None
                time.sleep(0.1)
        new_session(
            client,
            script_timeout=script_timeout,
            page_load_timeout=page_load_timeout,
            implicit_timeout=implicit_timeout,
            window_width=window_width,
            window_height=window_height,
        )
        yield client
    finally:
        if client:
            try:
                client.command("Marionette:Quit", {})
            except Exception:
                pass
            try:
                client.close()
            except Exception:
                pass
        terminate_process(process)
