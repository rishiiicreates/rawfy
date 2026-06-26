import json
import shutil
import subprocess
import sys
from typing import Any, Literal

class RawfyError(Exception):
    def __init__(self, message: str, code: str | None = None, url: str | None = None):
        self.code = code
        self.url = url
        super().__init__(message)
    def __repr__(self) -> str:
        return f"RawfyError({self.args[0]!r}, code={self.code!r}, url={self.url!r})"

OutputFormat = Literal["markdown", "json", "text", "html"]

def _get_rawfy_cmd() -> list[str]:
    if shutil.which("rawfy"):
        return ["rawfy"]
    if shutil.which("npx"):
        return ["npx", "-y", "rawfy"]
    raise RawfyError("rawfy CLI not found. Please install Node.js and run 'npm install -g rawfy'", code="CLI_NOT_FOUND")

def fetch(
    url: str,
    *,
    format: OutputFormat = "markdown",
    vision: bool = False,
    no_playwright: bool = False,
    max_tokens: int = 50_000,
    timeout: int = 30,
) -> str:
    cmd = _get_rawfy_cmd()
    cmd.extend(["fetch", url, "--format", format, "--max-tokens", str(max_tokens), "--timeout", str(timeout * 1000)])
    
    if vision:
        cmd.append("--vision")
    if no_playwright:
        cmd.append("--no-playwright")
        
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            err_msg = result.stderr.strip()
            raise RawfyError(f"Rawfy CLI failed: {err_msg}", code="CLI_ERROR", url=url)
        return result.stdout.strip()
    except Exception as e:
        if isinstance(e, RawfyError):
            raise
        raise RawfyError(str(e), code="SUBPROCESS_ERROR", url=url)

def fetch_json(url: str, **kwargs) -> dict[str, Any]:
    raw = fetch(url, format="json", **kwargs)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise RawfyError(f"Failed to parse rawfy JSON output: {e}\nRaw output: {raw[:100]}...", code="JSON_PARSE_ERROR", url=url)

def metadata(url: str, **kwargs) -> dict[str, Any]:
    data = fetch_json(url, max_tokens=10_000, **kwargs)
    return data.get("metadata", {})

def check_installation() -> dict[str, Any]:
    return {
        "node": bool(shutil.which("node")),
        "rawfy_cli": bool(shutil.which("rawfy")),
        "npx": bool(shutil.which("npx")),
        "version": "0.1.0"
    }

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