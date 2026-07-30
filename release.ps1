# release.ps1 - Auto build and publish to GitHub Releases
# Usage: .\release.ps1 [-Major] [-Minor] [-Patch]
#   Default: increment Patch version
#   -Major  increment major version (x.0.0)
#   -Minor  increment minor version (0.x.0)
#   -Patch  increment patch version (0.0.x) [default]

param(
    [switch]$Major,
    [switch]$Minor,
    [switch]$Patch
)

$ErrorActionPreference = "Stop"

# --- 0. Ensure python.exe is on PATH (PyInstaller internally calls `python`) ---
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    # 从 pyinstaller.exe 的位置反推 python 根目录
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
if ($Major) {
    $newMajor = $currentMajor + 1
    $newMinor = 0
    $newPatch = 0
}
elseif ($Minor) {
    $newMajor = $currentMajor
    $newMinor = $currentMinor + 1
    $newPatch = 0
}
else {
    $newMajor = $currentMajor
    $newMinor = $currentMinor
    $newPatch = $currentPatch + 1
}

$newVersion = "$newMajor.$newMinor.$newPatch"
$tag = "v$newVersion"

Write-Host "Version: $currentMajor.$currentMinor.$currentPatch -> $newVersion" -ForegroundColor Cyan

# --- 3. Update version in source ---
$newContent = $content -replace (
    '__version__\s*=\s*"\d+\.\d+\.\d+"'
), (
    "__version__ = `"$newVersion`""
)
[System.IO.File]::WriteAllText($scriptFile, $newContent, [System.Text.UTF8Encoding]::new($false))
Write-Host "[OK] Updated version in ones_timefiller.py" -ForegroundColor Green

# --- 4. PyInstaller build ---
Write-Host "`nBuilding..." -ForegroundColor Yellow
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

# --- 5. Git commit & tag ---
Write-Host "`nCommitting and tagging..." -ForegroundColor Yellow
git add ones_timefiller.py
git commit -m "release: v$newVersion"
git tag $tag
Write-Host "[OK] Created tag: $tag" -ForegroundColor Green

# --- 6. Push ---
Write-Host "`nPushing to remote..." -ForegroundColor Yellow
git push origin main
git push origin $tag
Write-Host "[OK] Pushed" -ForegroundColor Green

# --- 7. Create GitHub Release ---
Write-Host "`nCreating GitHub Release..." -ForegroundColor Yellow
$releaseNotes = @"
## ones-timefiller $tag

### Download
- ``ones-timefiller.exe`` - Windows executable, no Python required

### Usage
1. Download ``ones-timefiller.exe``
2. Create ``config.json`` in the same directory (see ``config.example.json``)
3. Double-click or run in terminal
"@

gh release create $tag $exePath --title "ones-timefiller $tag" --notes $releaseNotes

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[OK] Release published! $tag" -ForegroundColor Green
} else {
    Write-Error "gh release create failed"
    exit 1
}
