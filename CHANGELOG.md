# Changelog

All notable changes to Rawfy will be documented in this file.

## [0.2.1] — 2026-10-17

### 🤖 Universal AI Agent Skill & Windows Platform Parity

- **Direct AI Agent Skill Packaging**: Added `--install-skill` to `rawfy` CLI and single-command distribution via `uvx --from git+https://github.com/rishiiicreates/rawfy.git#subdirectory=python rawfy --install-skill` for automatic installation across Antigravity (`~/.agents/skills/rawfy`), Claude Code (`~/.claude/skills/rawfy`), and Gemini CLI environments.
- **Cross-Platform Skill Installers**: Added `install-skill.sh` (macOS/Linux) and `install-skill.ps1` (Windows PowerShell) for zero-dependency local agent skill installations.
- **Windows Platform Compatibility**: Fixed Windows console encoding crash on non-ASCII characters and emojis by safely reconfiguring `sys.stdout`/`sys.stderr` to UTF-8.
- **Windows Native Binary Sniffer**: Added `.exe` binary extension resolution to candidate paths and prevented infinite subprocess recursion loops by verifying `sys.prefix` and real path isolation.
- **Python Dependency Fixes**: Added `lxml-html-clean>=0.1.0` dependency to resolve broken `Document` cleaner imports on clean Python environments.
- **Python Ergonomics**: Re-exported all Pydantic core models (`PageData`, `PageMetadata`, `PageContent`, `FetchStats`, `OpenGraphData`, `OutputFormat`) at the top level of the `rawfy` Python package.

## [0.2.0] — 2026-10-16

### 🚀 Major Rewrite: Native Rust Core & Astral `uv` Distribution

Rawfy v0.2.0 is a complete reimagining built from the ground up in high-performance Rust (`rawfy-core` and `rawfy-cli`) and distributed directly via Astral's `uv` toolchain.

### Added

**Native Rust Engine (`rawfy-core` & `rawfy-cli`)**
- Sub-100ms static HTTP fetching using `reqwest` and `scraper`.
- Readability article extraction with DOM scoring and fallback heuristics.
- 57 passing Rust integration and unit tests covering fetch detection, markdown generation, media extraction, and truncation.

**Astral `uv` / `uvx` Distribution**
- Run instantly anywhere without installation: `uvx --from git+https://github.com/rishiiicreates/rawfy.git#subdirectory=python rawfy [url]`.
- Install as a global CLI tool via `uv tool install`.
- Python client package (`rawfy`) with Pydantic `snake_case` models and pure Python fallback engine (`RAWFY_FORCE_PYTHON=1`).

**Model Context Protocol (MCP) Server**
- Full compliance with MCP 2024-11-05 specification (`rawfy serve`).
- Exposes `rawfy_fetch`, `rawfy_metadata`, and `rawfy_extract` tools over `stdio`.
- Seamless zero-configuration setup for Claude Desktop, Cursor, and AntiGravity.

**High-Throughput REST API**
- Axum-based local web server (`rawfy api --port 3847`).
- Endpoints: `GET /health`, `GET /version`, `GET /fetch`, `POST /fetch`, `POST /metadata`, `POST /extract`.
- Emits `x-response-time-ms` headers across all endpoints for agent observability.

**Smart Anti-Noise Sanitization**
- Unified Git diffs: converts GitHub commit tables into syntax-highlighted ````diff` blocks with `+` and `-` markers.
- Wikipedia cleaning: removes 70+ language sidebars, personal tools, and `[[edit]]` links.
- Permalink anchor stripping: eliminates Hugo/Setext and ATX trailing anchors (`[#]`, `[§]`, `[¶]`).
- Code block cleanup: decodes HTML entities, removes `<font>`/`<span>` terminal color tags, and preserves language tags.
- Media filtering: blacklists tracking pixels, 1x1 gifs, Wikimedia wordmarks, and small UI icons (<32px).
- Accurate word metrics: counts plain text words rather than raw HTML markup.

---

## [0.1.0] — 2024-06-14

### 🎉 Initial Release

Rawfy — Universal web perception skill for AI agents.
