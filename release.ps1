# release.ps1 - Auto build and publish to GitHub Releases
# Usage: .\release.ps1 [-Major] [-Minor] [-Patch] [-Version "1.1.0"]
#   Default: increment Patch version
#   -Major    increment major version (x.0.0)
#   -Minor    increment minor version (0.x.0)
#   -Patch    increment patch version (0.0.x) [default]
#   -Version  specify exact target version (e.g. "1.1.0")

param(
    [switch]$Major,
    [switch]$Minor,
    [switch]$Patch,
    [string]$Version
)

$ErrorActionPreference = "Stop"

# --- 0. Ensure python.exe is on PATH (PyInstaller internally calls `python`) ---
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    $pyiCmd = Get-Command pyinstaller -ErrorAction SilentlyContinue
    if ($pyiCmd) {
        $pythonRoot = Split-Path $pyiCmd.Source -Parent | Split-Path -Parent
        if (Test-Path (Join-Path $pythonRoot "python.exe")) {
            $env:PATH = "$pythonRoot;$env:PATH"
            Write-Host "[INFO] Added python to PATH: $pythonRoot" -ForegroundColor DarkGray
        }
    }
}
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "python.exe not found on PATH. Please install Python or add it to PATH."
    exit 1
}

# --- 0b. Run extension tests ---
Write-Host "`nRunning extension unit tests..." -ForegroundColor Yellow
$testProc = Start-Process -FilePath "node" -ArgumentList "tests/test.js" -NoNewWindow -Wait -PassThru
if ($testProc.ExitCode -ne 0) {
    Write-Error "Extension unit tests failed. Aborting release."
    exit 1
}
Write-Host "[OK] All tests passed" -ForegroundColor Green

# --- 1. Read current version ---
$scriptFile = Join-Path $PSScriptRoot "ones_timefiller.py"
$content = Get-Content $scriptFile -Raw -Encoding UTF8

if ($content -notmatch '__version__\s*=\s*"(\d+)\.(\d+)\.(\d+)"') {
    Write-Error "Cannot parse version from ones_timefiller.py"
    exit 1
}

$currentMajor = [int]$Matches[1]
$currentMinor = [int]$Matches[2]
$currentPatch = [int]$Matches[3]

# --- 2. Calculate new version ---
if ($Version) {
    if ($Version -match '^v?(\d+\.\d+\.\d+)$') {
        $newVersion = $Matches[1]
    } elseif ($Version -match '^v?(\d+\.\d+)$') {
        $newVersion = "$($Matches[1]).0"
    } else {
        Write-Error "Invalid version format: $Version (expected e.g. 1.1 or 1.1.0)"
        exit 1
    }
}
elseif ($Major) {
    $newMajor = $currentMajor + 1
    $newMinor = 0
    $newPatch = 0
    $newVersion = "$newMajor.$newMinor.$newPatch"
}
elseif ($Minor) {
    $newMajor = $currentMajor
    $newMinor = $currentMinor + 1
    $newPatch = 0
    $newVersion = "$newMajor.$newMinor.$newPatch"
}
else {
    $newMajor = $currentMajor
    $newMinor = $currentMinor
    $newPatch = $currentPatch + 1
    $newVersion = "$newMajor.$newMinor.$newPatch"
}

$tag = "v$newVersion"

Write-Host "Version: $currentMajor.$currentMinor.$currentPatch -> $newVersion ($tag)" -ForegroundColor Cyan

# --- 3. Update version in sources ---
# 3a. Update ones_timefiller.py
$newContent = $content -replace (
    '__version__\s*=\s*"\d+\.\d+\.\d+"'
), (
    "__version__ = `"$newVersion`""
)
[System.IO.File]::WriteAllText($scriptFile, $newContent, [System.Text.UTF8Encoding]::new($false))
Write-Host "[OK] Updated version in ones_timefiller.py to $newVersion" -ForegroundColor Green

# 3b. Update extension/manifest.json
$manifestFile = Join-Path $PSScriptRoot "extension\manifest.json"
if (Test-Path $manifestFile) {
    $manifestContent = Get-Content $manifestFile -Raw -Encoding UTF8
    $newManifestContent = $manifestContent -replace '"version":\s*"[^"]+"', "`"version`": `"$newVersion`""
    [System.IO.File]::WriteAllText($manifestFile, $newManifestContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "[OK] Updated version in extension/manifest.json to $newVersion" -ForegroundColor Green
}

# --- 4. Package Chrome Extension Zip ---
Write-Host "`nPackaging Chrome Extension..." -ForegroundColor Yellow
$distDir = Join-Path $PSScriptRoot "dist"
if (-not (Test-Path $distDir)) { New-Item -ItemType Directory -Path $distDir | Out-Null }

$extensionDir = Join-Path $PSScriptRoot "extension"
$extensionZipPath = Join-Path $distDir "ones-helper-extension-v$newVersion.zip"

if (Test-Path $extensionZipPath) { Remove-Item $extensionZipPath -Force }
Compress-Archive -Path "$extensionDir\*" -DestinationPath $extensionZipPath -Force
$zipSize = [math]::Round((Get-Item $extensionZipPath).Length / 1KB, 2)
Write-Host "[OK] Packaged Chrome Extension: $extensionZipPath ($zipSize KB)" -ForegroundColor Green

# --- 5. PyInstaller build ---
Write-Host "`nBuilding EXE..." -ForegroundColor Yellow
Push-Location $PSScriptRoot
try {
    $iconArg = @()
    $iconFile = Join-Path $PSScriptRoot "ones-icon.ico"
    if (Test-Path $iconFile) {
        $iconArg = @("--icon", $iconFile)
    }
    $allArgs = @("--onefile", "--name", "ones-timefiller", "--console", "--clean") + $iconArg + @("ones_timefiller.py")
    $proc = Start-Process -FilePath "pyinstaller" -ArgumentList $allArgs -NoNewWindow -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        Write-Error "PyInstaller build failed"
        exit 1
    }
}
finally {
    Pop-Location
}

$exePath = Join-Path $PSScriptRoot "dist\ones-timefiller.exe"
if (-not (Test-Path $exePath)) {
    Write-Error "Build output not found: $exePath"
    exit 1
}
$exeSize = [math]::Round((Get-Item $exePath).Length / 1MB, 2)
Write-Host "[OK] Build complete: ones-timefiller.exe ($exeSize MB)" -ForegroundColor Green

# --- 6. Git commit & tag ---
Write-Host "`nCommitting and tagging..." -ForegroundColor Yellow
git add ones_timefiller.py extension/manifest.json extension/src/api.js
git diff-index --quiet HEAD
if ($LASTEXITCODE -ne 0) {
    git commit -m "release: v$newVersion"
} else {
    Write-Host "[INFO] Nothing to commit, proceeding with tag" -ForegroundColor DarkGray
}

# 检查 tag 是否已存在，若存在且为相同提交则覆盖/重新标记
$existingTag = git tag -l $tag
if ($existingTag) {
    Write-Host "[INFO] Tag $tag already exists. Force updating tag $tag..." -ForegroundColor Yellow
    git tag -f $tag
} else {
    git tag $tag
}
Write-Host "[OK] Tagged: $tag" -ForegroundColor Green

# --- 7. Push ---
Write-Host "`nPushing to remote..." -ForegroundColor Yellow
git push origin main
git push origin $tag -f
Write-Host "[OK] Pushed" -ForegroundColor Green

# --- 8. Create GitHub Release ---
Write-Host "`nCreating GitHub Release..." -ForegroundColor Yellow
$releaseNotes = @"
## ones-helper $tag

### 🌟 核心功能
- **浏览器扩展版 (Manifest V3)**：
  - 自动读取浏览器 Cookie 登录态，支持免 Cookie 手动配置与全流程可视化操作
  - 支持用户真实姓名显示与多项目工时分配
  - 联动北森考勤系统 (Italent) 自动解析与统计加班工时
  - 界面全流程中英文双语 (i18n) 动态切换
- **命令行脚本 (ones_timefiller.py)**：
  - 智能工时分配、自动状态流转 (Workflow)
  - 自动解析 Cookie / 自动刷新 ones-lt Token
  - 北森考勤接口升级为 v2 并完美支持加班四舍五入

### 📦 资产下载 (Downloads)
- ``ones-helper-extension-v$newVersion.zip`` - Chrome / Edge 浏览器扩展包（解压后在 ``chrome://extensions`` 加载）
- ``ones-timefiller.exe`` - Windows 可执行文件（无需 Python 环境）

### 🚀 快速使用 (Quick Start)
1. **浏览器扩展**：下载解压 ``ones-helper-extension-v$newVersion.zip``，在 Chrome 访问 ``chrome://extensions/`` 开启开发者模式，点击「加载已解压的扩展程序」选择解压文件夹。
2. **命令行工具**：下载 ``ones-timefiller.exe``，配合 ``config.json``（详见 README）直接双击或终端运行。
"@

# 如果已存在对应 tag 的 release，先删掉已有 release 以便重新创建
gh release delete $tag --yes 2>$null
gh release create $tag $exePath $extensionZipPath --title "ones-helper $tag" --notes $releaseNotes

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[OK] Release published! $tag" -ForegroundColor Green
} else {
    Write-Error "gh release create failed"
    exit 1
}

