import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from typing import Any, Literal, Optional
from pydantic import BaseModel
import httpx
from bs4 import BeautifulSoup
from readability import Document
import markdownify

if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

class RawfyError(Exception):
    def __init__(self, message: str, code: str | None = None, url: str | None = None, status_code: int | None = None):
        self.code = code
        self.url = url
        self.status_code = status_code
        super().__init__(message)
    def __repr__(self) -> str:
        return f"RawfyError({self.args[0]!r}, code={self.code!r}, url={self.url!r}, status_code={self.status_code!r})"

class OpenGraphData(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    url: Optional[str] = None
    site_name: Optional[str] = None

class PageMetadata(BaseModel):
    url: str
    canonical_url: Optional[str] = None
    type: str
    fetched_at: str
    lang: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    word_count: int
    reading_time_minutes: int
    interactive_element_count: int
    og: Optional[OpenGraphData] = None
    json_ld: Optional[list[Any]] = None

class PageContent(BaseModel):
    markdown: str
    text: str
    html: str

class FetchStats(BaseModel):
    method: str
    duration_ms: int
    estimated_tokens: int
    truncated: bool

class PageData(BaseModel):
    metadata: PageMetadata
    content: PageContent
    media: list[dict[str, Any]]
    interactive_elements: list[dict[str, Any]]
    fetch_stats: FetchStats

OutputFormat = Literal["markdown", "json", "text", "html"]

def fetch(
    url: str,
    *,
    format: OutputFormat = "markdown",
    vision: bool = False,
    no_playwright: bool = False,
    max_tokens: int = 50_000,
    timeout: int = 30,
) -> PageData:
    start_time = time.time()
    
    try:
        resp = httpx.get(
            url,
            timeout=timeout,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Rawfy/0.2.1 (Native Python Client)"}
        )
        resp.raise_for_status()
    except httpx.TimeoutException:
        raise RawfyError("Fetch timed out", code="FETCH_TIMEOUT", url=url)
    except httpx.HTTPStatusError as e:
        status = e.response.status_code
        raise RawfyError(f"HTTP {status} error: {str(e)}", code=f"HTTP_{status}", url=url, status_code=status)
    except Exception as e:
        raise RawfyError(f"Fetch failed: {str(e)}", code="FETCH_FAILED", url=url)
        
    html = resp.text
    final_url = str(resp.url)
    
    # Use readability-lxml to extract content
    doc = Document(html)
    summary_html = doc.summary()
    title = doc.title()

    # Beautiful Soup for additional metadata
    soup = BeautifulSoup(html, 'html.parser')

    if not title or title.strip() in ("[no-title]", ""):
        h1 = soup.find('h1')
        if h1:
            title = h1.get_text(strip=True)
        else:
            og_title = soup.find('meta', attrs={'property': 'og:title'})
            if og_title and og_title.has_attr('content'):
                title = og_title['content'].strip()
    
    canonical_tag = soup.find('link', rel='canonical')
    canonical_url = canonical_tag['href'] if canonical_tag and canonical_tag.has_attr('href') else None
    
    lang_tag = soup.find('html')
    lang = lang_tag.get('lang') if lang_tag else None
    
    desc_tag = soup.find('meta', attrs={'name': 'description'})
    description = desc_tag['content'] if desc_tag and desc_tag.has_attr('content') else None
    
    og = OpenGraphData()
    for prop in ['title', 'type', 'description', 'image', 'url']:
        tag = soup.find('meta', attrs={'property': f'og:{prop}'})
        if tag and tag.has_attr('content'):
            setattr(og, prop, tag['content'])
            
    site_tag = soup.find('meta', attrs={'property': 'og:site_name'})
    if site_tag and site_tag.has_attr('content'):
        og.site_name = site_tag['content']
        
    # Convert HTML to Markdown
    md = markdownify.markdownify(summary_html, heading_style="ATX").strip()
    
    # Convert HTML to plain text
    summary_soup = BeautifulSoup(summary_html, 'html.parser')
    text = summary_soup.get_text(separator=' ', strip=True)
    
    word_count = len(text.split())
    estimated_tokens = max(1, int(word_count * 1.33))
    
    truncated = False
    if estimated_tokens > max_tokens:
        words = md.split()
        target_words = max(1, int(max_tokens / 1.33))
        if len(words) > target_words:
            omitted = max(1, estimated_tokens - max_tokens)
            md = " ".join(words[:target_words]) + f"\n\n[TRUNCATED: output exceeded {max_tokens} token limit. ~{omitted} tokens omitted...]"
            truncated = True
    
    metadata = PageMetadata(
        url=final_url,
        canonical_url=canonical_url,
        type="article",
        fetched_at=datetime.now(timezone.utc).isoformat(),
        lang=lang,
        title=title,
        description=description,
        word_count=word_count,
        reading_time_minutes=max(1, (word_count + 199) // 200),
        interactive_element_count=0,
        og=og,
        json_ld=None
    )
    
    content = PageContent(
        markdown=md,
        text=text,
        html=summary_html
    )
    
    duration_ms = int((time.time() - start_time) * 1000)
    
    stats = FetchStats(
        method="static",
        duration_ms=duration_ms,
        estimated_tokens=estimated_tokens,
        truncated=truncated
    )
    
    return PageData(
        metadata=metadata,
        content=content,
        media=[],
        interactive_elements=[],
        fetch_stats=stats
    )

def fetch_json(url: str, **kwargs) -> dict[str, Any]:
    # Backwards compatibility: dump the pydantic model as dict
    page_data = fetch(url, **kwargs)
    return page_data.model_dump()

def metadata(url: str, **kwargs) -> PageMetadata:
    page_data = fetch(url, **kwargs)
    return page_data.metadata

def _find_native_binary() -> Optional[str]:
    ext = ".exe" if sys.platform == "win32" else ""
    candidates = [
        os.environ.get("RAWFY_NATIVE_BIN"),
        os.path.expanduser(f"~/rawfy/target/release/rawfy{ext}"),
        os.path.expanduser(f"~/.cargo/bin/rawfy{ext}"),
    ]
    for cand in candidates:
        if cand and os.path.isfile(cand) and (os.access(cand, os.X_OK) or sys.platform == "win32"):
            return cand

    which_bin = shutil.which("rawfy")
    if which_bin:
        is_self = False
        try:
            if sys.prefix and which_bin.lower().startswith(sys.prefix.lower()):
                is_self = True
            if os.path.realpath(which_bin).lower() == os.path.realpath(sys.argv[0]).lower():
                is_self = True
        except Exception:
            pass

        if not is_self:
            try:
                with open(which_bin, "rb") as f:
                    header = f.read(4)
                    if header in (b"\xcf\xfa\xed\xfe", b"\xfe\xed\xfa\xcf", b"\x7fELF") or header[:2] == b"MZ":
                        return which_bin
            except Exception:
                pass
    return None

def check_installation() -> dict[str, Any]:
    """Check if the native Rust binary is available on the system."""
    native_bin = _find_native_binary()
    return {
        "native_binary_available": native_bin is not None,
        "native_binary_path": native_bin,
        "engine": "rust" if native_bin is not None else "python",
        "version": "0.2.1",
    }

SKILL_MARKDOWN = """---
name: rawfy
description: Use this skill whenever the user wants to extract content from a URL, convert a webpage to Markdown, fetch structured data from a site, scrape clean text for an AI agent, turn a URL into machine-readable content, or use Rawfy as part of an agentic pipeline. Triggers on phrases like "fetch this URL", "extract content from", "scrape this page", "convert URL to markdown", "get the text from this website", or any time a URL needs to become structured data for downstream processing.
---

# Rawfy Skill

## 1. What is Rawfy
Rawfy is a fast web perception engine for AI agents that converts any URL into structured, agent-readable markdown, clean text, or JSON with metadata, word counts, and token budget truncation.

## 2. Agent Usage
Run rawfy CLI directly from bash:
```bash
rawfy <url>
rawfy <url> -f json
rawfy <url> --max-tokens 5000
```
Or via Python:
```python
from rawfy import fetch
page = fetch("<url>")
print(page.content.markdown)
```
"""

def install_skill() -> None:
    home = os.path.expanduser("~")
    dirs = [
        os.path.join(home, ".agents", "skills", "rawfy"),
        os.path.join(home, ".claude", "skills", "rawfy"),
    ]
    gemini_base = os.path.join(home, ".gemini", "antigravity-cli", "skills")
    if os.path.isdir(gemini_base):
        dirs.append(os.path.join(gemini_base, "rawfy"))

    installed = []
    for d in dirs:
        try:
            os.makedirs(d, exist_ok=True)
            skill_path = os.path.join(d, "SKILL.md")
            with open(skill_path, "w", encoding="utf-8") as f:
                f.write(SKILL_MARKDOWN.strip() + "\n")
            installed.append(skill_path)
        except Exception as e:
            print(f"Warning: could not install to {d}: {e}", file=sys.stderr)

    print("✅ Rawfy skill successfully installed for AI agents:")
    for p in installed:
        print(f"   - {p}")
    print("\n✨ AGY, Claude Code, Codex, and Gemini CLI can now use Rawfy automatically!")

def main() -> None:
    # 1. Native Rust binary check: unless RAWFY_FORCE_PYTHON is set
    force_python = os.environ.get("RAWFY_FORCE_PYTHON", "").lower() in ("1", "true")
    if not force_python and "--install-skill" not in sys.argv and "install-skill" not in sys.argv:
        native_bin = _find_native_binary()
        if native_bin:
            try:
                res = subprocess.run([native_bin] + sys.argv[1:])
                sys.exit(res.returncode)
            except Exception:
                pass

    # 2. Pure Python fallback CLI with full argparse support
    parser = argparse.ArgumentParser(
        prog="rawfy",
        description="Fast perception layer for AI agents — converts any URL into structured, agent-readable content",
    )
    parser.add_argument("url", nargs="?", default=None, help="The URL to fetch and convert")
    parser.add_argument("-f", "--format", choices=["markdown", "json", "text", "html"], default="markdown", help="Output format")
    parser.add_argument("-o", "--out", type=str, default=None, help="Write output to file instead of stdout")
    parser.add_argument("-q", "--quiet", action="store_true", help="Suppress progress output")
    parser.add_argument("--no-footer", action="store_true", help="Suppress promotional footer")
    parser.add_argument("--no-stats", action="store_true", help="Suppress fetch stats block in markdown output")
    parser.add_argument("--max-tokens", type=int, default=50000, help="Maximum tokens in output")
    parser.add_argument("--timeout", type=int, default=30, help="Fetch timeout in seconds")
    parser.add_argument("--install-skill", action="store_true", help="Install rawfy skill into AI agent directories (~/.agents/skills, ~/.claude/skills)")
    parser.add_argument("-v", "-V", "--version", action="version", version="rawfy 0.2.1")

    args = parser.parse_args()

    if args.install_skill or args.url == "install-skill":
        install_skill()
        sys.exit(0)

    url = args.url
    if not url:
        if not sys.stdin.isatty():
            piped = sys.stdin.read().strip()
            if piped:
                url = piped.splitlines()[0].strip()
        if not url:
            parser.print_help()
            sys.exit(1)

    try:
        result = fetch(
            url,
            format=args.format,
            max_tokens=args.max_tokens,
            timeout=args.timeout,
        )
        if args.format == "json":
            output = result.model_dump_json(indent=2)
        elif args.format == "html":
            output = result.content.html
        elif args.format == "text":
            output = result.content.text
        else:
            fm_lines = [
                "---",
                f"url: {result.metadata.url}",
            ]
            if result.metadata.canonical_url:
                fm_lines.append(f"canonical_url: {result.metadata.canonical_url}")
            fm_lines.extend([
                f"type: {result.metadata.type}",
                f"fetched_at: {result.metadata.fetched_at}",
            ])
            if result.metadata.lang:
                fm_lines.append(f"lang: {result.metadata.lang}")
            if result.metadata.title:
                escaped_title = result.metadata.title.replace('"', '\\"')
                fm_lines.append(f'title: "{escaped_title}"')
            fm_lines.extend([
                f"word_count: {result.metadata.word_count}",
                f"reading_time_minutes: {result.metadata.reading_time_minutes}",
                f"interactive_elements: {result.metadata.interactive_element_count}",
                f"media_count: {len(result.media)}",
                "---",
                "",
                result.content.markdown,
            ])
            if not getattr(args, "no_stats", False):
                fm_lines.extend([
                    "",
                    "---",
                    "_Rawfy fetch stats:_",
                    f"- method: {result.fetch_stats.method}",
                    f"- Duration: {result.fetch_stats.duration_ms}ms",
                    f"- Estimated tokens: {result.fetch_stats.estimated_tokens}",
                ])
                if result.fetch_stats.truncated:
                    fm_lines.append("- ⚠️ Output was truncated")
                if not args.no_footer and not args.quiet:
                    fm_lines.append("- ⭐ Star & follow @rishiiicreates on GitHub: https://github.com/rishiiicreates/rawfy")
            output = "\n".join(fm_lines)

        if args.out:
            out_path = os.path.expanduser(args.out)
            parent = os.path.dirname(out_path)
            if parent:
                os.makedirs(parent, exist_ok=True)
            with open(out_path, "w", encoding="utf-8") as f:
                f.write(output)
            if not args.quiet:
                print(f"✅ Output written to {args.out}", file=sys.stderr)
        else:
            print(output)
    except RawfyError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
