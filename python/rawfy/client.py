import json
import sys
import time
from datetime import datetime, timezone
from typing import Any, Literal, Optional
from pydantic import BaseModel
import httpx
from bs4 import BeautifulSoup
from readability import Document
import markdownify

class RawfyError(Exception):
    def __init__(self, message: str, code: str | None = None, url: str | None = None):
        self.code = code
        self.url = url
        super().__init__(message)
    def __repr__(self) -> str:
        return f"RawfyError({self.args[0]!r}, code={self.code!r}, url={self.url!r})"

class OpenGraphData(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    url: Optional[str] = None
    siteName: Optional[str] = None

class PageMetadata(BaseModel):
    url: str
    canonicalUrl: Optional[str] = None
    type: str
    fetchedAt: str
    lang: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    wordCount: int
    readingTimeMinutes: int
    interactiveElementCount: int
    og: Optional[OpenGraphData] = None
    jsonLd: Optional[list[Any]] = None

class PageContent(BaseModel):
    markdown: str
    text: str
    html: str

class FetchStats(BaseModel):
    method: str
    durationMs: int
    estimatedTokens: int
    truncated: bool

class PageData(BaseModel):
    metadata: PageMetadata
    content: PageContent
    media: list[dict[str, Any]]
    interactiveElements: list[dict[str, Any]]
    fetchStats: FetchStats

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
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Rawfy/0.1.1 (Native Python Client)"}
        )
        resp.raise_for_status()
    except httpx.TimeoutException:
        raise RawfyError("Fetch timed out", code="FETCH_TIMEOUT", url=url)
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
    
    canonical_tag = soup.find('link', rel='canonical')
    canonical_url = canonical_tag['href'] if canonical_tag and canonical_tag.has_attr('href') else None
    
    lang_tag = soup.find('html')
    lang = lang_tag.get('lang') if lang_tag else None
    
    desc_tag = soup.find('meta', attrs={'name': 'description'})
    description = desc_tag['content'] if desc_tag and desc_tag.has_attr('content') else None
    
    og = OpenGraphData()
    og_title = soup.find('meta', property='og:title')
    if og_title: og.title = og_title.get('content')
    og_desc = soup.find('meta', property='og:description')
    if og_desc: og.description = og_desc.get('content')
    og_image = soup.find('meta', property='og:image')
    if og_image: og.image = og_image.get('content')
    og_type = soup.find('meta', property='og:type')
    if og_type: og.type = og_type.get('content')
    
    # Convert HTML to Markdown
    md = markdownify.markdownify(summary_html, heading_style="ATX").strip()
    
    # Convert HTML to plain text
    summary_soup = BeautifulSoup(summary_html, 'html.parser')
    text = summary_soup.get_text(separator=' ', strip=True)
    
    word_count = len(text.split())
    
    metadata = PageMetadata(
        url=final_url,
        canonicalUrl=canonical_url,
        type="article",
        fetchedAt=datetime.now(timezone.utc).isoformat(),
        lang=lang,
        title=title,
        description=description,
        wordCount=word_count,
        readingTimeMinutes=max(1, word_count // 200),
        interactiveElementCount=0,
        og=og,
        jsonLd=None
    )
    
    content = PageContent(
        markdown=md,
        text=text,
        html=summary_html
    )
    
    duration_ms = int((time.time() - start_time) * 1000)
    
    stats = FetchStats(
        method="static",
        durationMs=duration_ms,
        estimatedTokens=word_count, # rough proxy
        truncated=False
    )
    
    return PageData(
        metadata=metadata,
        content=content,
        media=[],
        interactiveElements=[],
        fetchStats=stats
    )

def fetch_json(url: str, **kwargs) -> dict[str, Any]:
    # Backwards compatibility: just dump the pydantic model
    page_data = fetch(url, **kwargs)
    return page_data.model_dump()

def metadata(url: str, **kwargs) -> dict[str, Any]:
    page_data = fetch(url, **kwargs)
    return page_data.metadata.model_dump()

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
        result = fetch(url, format=fmt)
        if fmt == "json":
            print(result.model_dump_json(indent=2))
        elif fmt == "html":
            print(result.content.html)
        elif fmt == "text":
            print(result.content.text)
        else:
            print(result.content.markdown)
    except RawfyError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
