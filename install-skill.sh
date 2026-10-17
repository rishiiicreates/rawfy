#!/usr/bin/env bash
set -e

# Rawfy Skill Installer for AI Agents (AGY, Claude Code, Codex, Gemini CLI)
REPO_RAW_URL="https://raw.githubusercontent.com/rishiiicreates/rawfy/main"
SKILL_NAME="rawfy"

echo "⚡ Installing Rawfy skill for AI agents..."

# Target directories
AGENTS_SKILLS_DIR="$HOME/.agents/skills/$SKILL_NAME"
CLAUDE_SKILLS_DIR="$HOME/.claude/skills/$SKILL_NAME"
GEMINI_SKILLS_DIR="$HOME/.gemini/antigravity-cli/skills/$SKILL_NAME"

INSTALLED_PATHS=()

# 1. Install to ~/.agents/skills (Standard cross-agent hub: AGY, Codex, OpenClaw, Gemini CLI)
mkdir -p "$AGENTS_SKILLS_DIR"
if [ -f "SKILL.md" ]; then
    cp "SKILL.md" "$AGENTS_SKILLS_DIR/SKILL.md"
else
    curl -fsSL "$REPO_RAW_URL/SKILL.md" -o "$AGENTS_SKILLS_DIR/SKILL.md"
fi
INSTALLED_PATHS+=("$AGENTS_SKILLS_DIR")

# 2. Install to ~/.claude/skills (Claude Code)
mkdir -p "$HOME/.claude/skills"
if [ -d "$HOME/.claude/skills" ]; then
    ln -sf "$AGENTS_SKILLS_DIR" "$CLAUDE_SKILLS_DIR" 2>/dev/null || cp "$AGENTS_SKILLS_DIR/SKILL.md" "$CLAUDE_SKILLS_DIR/SKILL.md"
    INSTALLED_PATHS+=("$CLAUDE_SKILLS_DIR")
fi

# 3. Install to ~/.gemini/antigravity-cli/skills if present
if [ -d "$HOME/.gemini/antigravity-cli/skills" ]; then
    mkdir -p "$GEMINI_SKILLS_DIR"
    if [ "$AGENTS_SKILLS_DIR/SKILL.md" != "$GEMINI_SKILLS_DIR/SKILL.md" ]; then
        cp -f "$AGENTS_SKILLS_DIR/SKILL.md" "$GEMINI_SKILLS_DIR/SKILL.md" 2>/dev/null || true
    fi
    INSTALLED_PATHS+=("$GEMINI_SKILLS_DIR")
fi

# Check if CLI tool is available
CLI_FOUND=false
if command -v rawfy >/dev/null 2>&1; then
    CLI_FOUND=true
fi

echo ""
echo "✅ Rawfy skill successfully installed to:"
for p in "${INSTALLED_PATHS[@]}"; do
    echo "   - $p/SKILL.md"
done

echo ""
if [ "$CLI_FOUND" = true ]; then
    echo "🚀 CLI tool detected: $(command -v rawfy)"
else
    echo "💡 Note: To use the underlying CLI engine, install via uv:"
    echo '   uv tool install "git+https://github.com/rishiiicreates/rawfy.git#subdirectory=python"'
    echo "   or run directly on-demand with npx: npx @rishiicreates/rawfy <url>"
fi

echo "✨ Ready! Your agents in AGY, Claude Code, and Codex will now automatically use Rawfy for web perception."
