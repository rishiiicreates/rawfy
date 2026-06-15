"""
Rawfy — Python wrapper for the Rawfy AI agent skill.

Provides a Pythonic interface to the Rawfy CLI for fetching and
processing web pages into agent-readable content.

Usage:
    from rawfy import fetch, metadata

    # Full page fetch
    result = fetch("https://example.com")
    print(result)

    # JSON format for structured data
    data = fetch("https://example.com", format="json")
    import json
    parsed = json.loads(data)

    # Metadata only (lightweight)
    meta = metadata("https://example.com")
"""

from rawfy.client import fetch, metadata, RawfyError

__version__ = "0.1.0"
__all__ = ["fetch", "metadata", "RawfyError", "__version__"]
