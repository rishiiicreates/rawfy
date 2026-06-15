"""
Rawfy Python client — subprocess wrapper around the Rawfy CLI.

This module shells out to the `rawfy` Node.js CLI and parses
the output. It requires Node.js >= 18 and `rawfy` to be installed
globally or available via npx.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from typing import Any, Literal


class RawfyError(Exception):
    """Raised when the Rawfy CLI returns an error."""

    def __init__(self, message: str, code: str | None = None, url: str | None = None):
        self.code = code
        self.url = url
        super().__init__(message)

    def __repr__(self) -> str:
        parts = [f"RawfyError({self.args[0]!r}"]
        if self.code:
            parts.append(f", code={self.code!r}")
        if self.url:
            parts.append(f", url={self.url!r}")
        parts.append(")")
        return "".join(parts)


OutputFormat = Literal["markdown", "json", "text"]


def _find_rawfy_cli() -> list[str]:
    """
    Locate the rawfy CLI executable.

    Search order:
    1. `rawfy` in PATH (global npm install)
    2. `npx rawfy` (local install / npx resolution)
    3. `node node_modules/.bin/rawfy` (project-local)

    Returns the command prefix as a list of strings.
    """
    # 1. Check if rawfy is directly in PATH
    if shutil.which("rawfy"):
        return ["rawfy"]

    # 2. Check if npx is available
    if shutil.which("npx"):
        return ["npx", "-y", "rawfy"]

    # 3. Check if node is available for direct execution
    if shutil.which("node"):
        return ["node", "node_modules/.bin/rawfy"]

    raise RawfyError(
        "Could not find rawfy CLI. Install it with: npm install -g rawfy",
        code="CLI_NOT_FOUND",
    )


def fetch(
    url: str,
    *,
    format: OutputFormat = "markdown",
    vision: bool = False,
    no_playwright: bool = False,
    max_tokens: int = 50_000,
    timeout: int = 30,
) -> str:
    """
    Fetch a URL and return its content in the specified format.

    Args:
        url: The URL to fetch and process.
        format: Output format — "markdown" (default), "json", or "text".
        vision: Enable vision API for image descriptions.
        no_playwright: Skip Playwright, use static fetch only.
        max_tokens: Maximum output tokens (default: 50000).
        timeout: Subprocess timeout in seconds (default: 30).

    Returns:
        The processed page content as a string.

    Raises:
        RawfyError: If the fetch fails or the CLI is not found.
    """
    cmd = _find_rawfy_cli()
    cmd.extend(["fetch", url, "--format", format, "--max-tokens", str(max_tokens)])

    if vision:
        cmd.append("--vision")
    if no_playwright:
        cmd.append("--no-playwright")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except FileNotFoundError:
        raise RawfyError(
            "Node.js not found. Rawfy requires Node.js >= 18.",
            code="NODE_NOT_FOUND",
        )
    except subprocess.TimeoutExpired:
        raise RawfyError(
            f"Rawfy timed out after {timeout}s fetching {url}",
            code="TIMEOUT",
            url=url,
        )

    if result.returncode != 0:
        stderr = result.stderr.strip()
        raise RawfyError(
            stderr or f"rawfy fetch failed with exit code {result.returncode}",
            code="FETCH_FAILED",
            url=url,
        )

    return result.stdout


def fetch_json(
    url: str,
    *,
    vision: bool = False,
    no_playwright: bool = False,
    max_tokens: int = 50_000,
    timeout: int = 30,
) -> dict[str, Any]:
    """
    Fetch a URL and return structured data as a Python dict.

    Convenience wrapper around fetch() with format="json".

    Args:
        url: The URL to fetch and process.
        vision: Enable vision API for image descriptions.
        no_playwright: Skip Playwright, use static fetch only.
        max_tokens: Maximum output tokens (default: 50000).
        timeout: Subprocess timeout in seconds (default: 30).

    Returns:
        Parsed JSON as a dict with keys: metadata, content, media,
        interactive_elements, fetch_stats.

    Raises:
        RawfyError: If the fetch fails or JSON parsing fails.
    """
    raw = fetch(
        url,
        format="json",
        vision=vision,
        no_playwright=no_playwright,
        max_tokens=max_tokens,
        timeout=timeout,
    )

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise RawfyError(
            f"Failed to parse rawfy JSON output: {e}",
            code="JSON_PARSE_ERROR",
            url=url,
        )


def metadata(
    url: str,
    *,
    no_playwright: bool = False,
    timeout: int = 15,
) -> dict[str, Any]:
    """
    Fetch only the metadata for a URL (lightweight).

    Returns title, description, type, language, word count, etc.
    without processing media or generating full content.

    Args:
        url: The URL to fetch metadata for.
        no_playwright: Skip Playwright, use static fetch only.
        timeout: Subprocess timeout in seconds (default: 15).

    Returns:
        Metadata dict with keys: url, title, description, type,
        lang, word_count, reading_time_minutes, etc.

    Raises:
        RawfyError: If the fetch fails.
    """
    # Use the JSON format and extract just the metadata
    data = fetch_json(
        url,
        no_playwright=no_playwright,
        max_tokens=10_000,
        timeout=timeout,
    )
    return data.get("metadata", {})


def check_installation() -> dict[str, Any]:
    """
    Check if Rawfy and its dependencies are properly installed.

    Returns:
        Dict with installation status:
        {
            "node": True/False,
            "rawfy_cli": True/False,
            "playwright": True/False,
            "version": "0.1.0" or None
        }
    """
    status: dict[str, Any] = {
        "node": False,
        "rawfy_cli": False,
        "playwright": False,
        "version": None,
    }

    # Check Node.js
    if shutil.which("node"):
        status["node"] = True

    # Check rawfy CLI
    try:
        cmd = _find_rawfy_cli()
        result = subprocess.run(
            [*cmd, "version"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            status["rawfy_cli"] = True
            status["version"] = result.stdout.strip()
    except (RawfyError, subprocess.TimeoutExpired, FileNotFoundError):
        pass

    # Check Playwright
    try:
        result = subprocess.run(
            ["npx", "playwright", "--version"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            status["playwright"] = True
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass

    return status


def main() -> None:
    """CLI entry point for python -m rawfy."""
    if len(sys.argv) < 2:
        print("Usage: python -m rawfy <url> [--format markdown|json|text]")
        sys.exit(1)

    url = sys.argv[1]
    fmt: OutputFormat = "markdown"

    if "--format" in sys.argv:
        idx = sys.argv.index("--format")
        if idx + 1 < len(sys.argv):
            fmt = sys.argv[idx + 1]  # type: ignore[assignment]

    try:
        output = fetch(url, format=fmt)
        print(output)
    except RawfyError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


# Entry point for `python -m rawfy`
if __name__ == "__main__":
    main()
