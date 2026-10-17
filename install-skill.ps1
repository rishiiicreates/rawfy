# Rawfy Skill Installer for Windows AI Agents (PowerShell)
$ErrorActionPreference = "Stop"

$RepoRawUrl = "https://raw.githubusercontent.com/rishiiicreates/rawfy/main"
$SkillName = "rawfy"

Write-Host "⚡ Installing Rawfy skill for AI agents..." -ForegroundColor Cyan

$HomeDir = [System.Environment]::GetFolderPath('UserProfile')
$AgentsSkillsDir = Join-Path $HomeDir ".agents\skills\$SkillName"
$ClaudeSkillsDir = Join-Path $HomeDir ".claude\skills\$SkillName"
$GeminiSkillsDir = Join-Path $HomeDir ".gemini\antigravity-cli\skills\$SkillName"

$InstalledPaths = @()

# 1. ~/.agents/skills (AGY, Codex, OpenClaw, Gemini CLI)
New-Item -ItemType Directory -Force -Path $AgentsSkillsDir | Out-Null
$TargetSkillFile = Join-Path $AgentsSkillsDir "SKILL.md"

if (Test-Path "SKILL.md") {
    Copy-Item "SKILL.md" -Destination $TargetSkillFile -Force
} else {
    Invoke-WebRequest -Uri "$RepoRawUrl/SKILL.md" -OutFile $TargetSkillFile
}
$InstalledPaths += $AgentsSkillsDir

# 2. ~/.claude/skills (Claude Code)
$ClaudeBase = Join-Path $HomeDir ".claude\skills"
New-Item -ItemType Directory -Force -Path $ClaudeBase | Out-Null
New-Item -ItemType Directory -Force -Path $ClaudeSkillsDir | Out-Null
Copy-Item $TargetSkillFile -Destination (Join-Path $ClaudeSkillsDir "SKILL.md") -Force
$InstalledPaths += $ClaudeSkillsDir

# 3. ~/.gemini/antigravity-cli/skills if present
$GeminiBase = Join-Path $HomeDir ".gemini\antigravity-cli\skills"
if (Test-Path $GeminiBase) {
    New-Item -ItemType Directory -Force -Path $GeminiSkillsDir | Out-Null
    Copy-Item $TargetSkillFile -Destination (Join-Path $GeminiSkillsDir "SKILL.md") -Force
    $InstalledPaths += $GeminiSkillsDir
}

Write-Host ""
Write-Host "✅ Rawfy skill successfully installed to:" -ForegroundColor Green
foreach ($p in $InstalledPaths) {
    Write-Host "   - $p\SKILL.md"
}

Write-Host ""
if (Get-Command rawfy -ErrorAction SilentlyContinue) {
    Write-Host "🚀 CLI tool detected: $((Get-Command rawfy).Source)" -ForegroundColor Green
} else {
    Write-Host "💡 Note: To install the underlying CLI engine on Windows, run:" -ForegroundColor Yellow
    Write-Host '   uv tool install "git+https://github.com/rishiiicreates/rawfy.git#subdirectory=python"'
}

Write-Host "✨ Ready! Your agents in AGY, Claude Code, and Codex will now automatically use Rawfy for web perception." -ForegroundColor Cyan
