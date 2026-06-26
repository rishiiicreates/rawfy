import json
import shutil
import subprocess
import sys
import time
import urllib.request
import urllib.error
from urllib.parse import urlencode
from typing import Any, Literal
import atexit

class RawfyError(Exception):
    def __init__(self, message: str, code: str | None = None, url: str | None = None):
        self.code = code
        self.url = url
        super().__init__(message)
    def __repr__(self) -> str:
        return f"RawfyError({self.args[0]!r}, code={self.code!r}, url={self.url!r})"

OutputFormat = Literal["markdown", "json", "text", "html"]

_api_process = None

def _ensure_api_running():
    global _api_process
    try:
        urllib.request.urlopen("http://localhost:3847/", timeout=1)
        return  # Already running
    except urllib.error.URLError:
        pass
    
    if _api_process is None:
        cmd = ["npx", "-y", "rawfy", "api", "--port", "3847"]
        _api_process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Wait for it to boot
        for _ in range(30):
            try:
                urllib.request.urlopen("http://localhost:3847/", timeout=1)
                break
            except Exception:
                time.sleep(0.5)
        else:
            raise RawfyError("Failed to start Rawfy local API", code="API_TIMEOUT")

def _cleanup():
    if _api_process:
        _api_process.terminate()

atexit.register(_cleanup)

def fetch(
    url: str,
    *,
    format: OutputFormat = "markdown",
    vision: bool = False,
    no_playwright: bool = False,
    max_tokens: int = 50_000,
    timeout: int = 30,
) -> str:
    _ensure_api_running()
    
    params = {
        "url": url,
        "format": format,
        "vision": "true" if vision else "false",
        "noPlaywright": "true" if no_playwright else "false",
        "maxTokens": max_tokens
    }
    query = urlencode(params)
    api_url = f"http://localhost:3847/fetch?{query}"
    
    try:
        req = urllib.request.Request(api_url, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            err_json = json.loads(err_body)
            raise RawfyError(err_json.get("error", "Unknown error"), code=err_json.get("code", "FETCH_FAILED"), url=url)
        except json.JSONDecodeError:
            raise RawfyError(err_body or str(e), code="FETCH_FAILED", url=url)
    except Exception as e:
        raise RawfyError(str(e), code="NETWORK_ERROR", url=url)

def fetch_json(url: str, **kwargs) -> dict[str, Any]:
    raw = fetch(url, format="json", **kwargs)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise RawfyError(f"Failed to parse rawfy JSON output: {e}", code="JSON_PARSE_ERROR", url=url)

def metadata(url: str, **kwargs) -> dict[str, Any]:
    data = fetch_json(url, max_tokens=10_000, **kwargs)
    return data.get("metadata", {})

def check_installation() -> dict[str, Any]:
    return {"node": bool(shutil.which("node")), "rawfy_cli": True, "playwright": True, "version": "0.1.0"}

def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python -m rawfy <url> [--format markdown|json|text|html]")
        sys.exit(1)
    
    url = sys.argv[1]
    fmt: OutputFormat = "markdown"
    if "--format" in sys.argv:
        idx = sys.argv.index("--format")
        if idx + 1 < len(sys.argv):
            fmt = sys.argv[idx + 1]  # type: ignore
    
    try:
        print(fetch(url, format=fmt))
    except RawfyError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()