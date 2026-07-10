# release.ps1 - 自动打包并发布到 GitHub Releases
# 用法: .\release.ps1 [-Major] [-Minor] [-Patch]
#   默认递增 Patch 版本号
#   -Major  递增主版本号 (x.0.0)
#   -Minor  递增次版本号 (0.x.0)
#   -Patch  递增修订号 (0.0.x) [默认]

param(
    [switch]$Major,
    [switch]$Minor,
    [switch]$Patch
)

$ErrorActionPreference = "Stop"

# ─── 1. 读取当前版本号 ────────────────────────────────────────────────────────
$scriptFile = Join-Path $PSScriptRoot "ones_timefiller.py"
$content = Get-Content $scriptFile -Raw -Encoding UTF8

if ($content -notmatch '__version__\s*=\s*"(\d+)\.(\d+)\.(\d+)"') {
    Write-Error "无法从 ones_timefiller.py 中解析版本号"
    exit 1
}

$currentMajor = [int]$Matches[1]
$currentMinor = [int]$Matches[2]
$currentPatch = [int]$Matches[3]

# ─── 2. 计算新版本号 ──────────────────────────────────────────────────────────
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
    # 默认 Patch
    $newMajor = $currentMajor
    $newMinor = $currentMinor
    $newPatch = $currentPatch + 1
}

$newVersion = "$newMajor.$newMinor.$newPatch"
$tag = "v$newVersion"

Write-Host "版本: $currentMajor.$currentMinor.$currentPatch -> $newVersion" -ForegroundColor Cyan

# ─── 3. 更新源码中的版本号 ────────────────────────────────────────────────────
$newContent = $content -replace (
    '__version__\s*=\s*"\d+\.\d+\.\d+"'
), (
    "__version__ = `"$newVersion`""
)
Set-Content $scriptFile -Value $newContent -Encoding UTF8NoBOM -NoNewline
Write-Host "[OK] 已更新 ones_timefiller.py 中的版本号" -ForegroundColor Green

# ─── 4. PyInstaller 打包 ──────────────────────────────────────────────────────
Write-Host "`n正在打包..." -ForegroundColor Yellow
Push-Location $PSScriptRoot
try {
    pyinstaller --onefile --name ones-timefiller --console --clean ones_timefiller.py 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) {
        Write-Error "PyInstaller 打包失败"
        exit 1
    }
}
finally {
    Pop-Location
}

$exePath = Join-Path $PSScriptRoot "dist\ones-timefiller.exe"
if (-not (Test-Path $exePath)) {
    Write-Error "找不到打包产物: $exePath"
    exit 1
}
$exeSize = [math]::Round((Get-Item $exePath).Length / 1MB, 2)
Write-Host "[OK] 打包完成: ones-timefiller.exe ($exeSize MB)" -ForegroundColor Green

# ─── 5. Git 提交 & 打 Tag ────────────────────────────────────────────────────
Write-Host "`n提交代码并打 Tag..." -ForegroundColor Yellow
git add ones_timefiller.py
git commit -m "release: v$newVersion"
git tag $tag
Write-Host "[OK] 已创建 Tag: $tag" -ForegroundColor Green

# ─── 6. 推送代码 & Tag ────────────────────────────────────────────────────────
Write-Host "`n推送到远程..." -ForegroundColor Yellow
git push origin main
git push origin $tag
Write-Host "[OK] 已推送" -ForegroundColor Green

# ─── 7. 用 gh 创建 Release ────────────────────────────────────────────────────
Write-Host "`n创建 GitHub Release..." -ForegroundColor Yellow
$releaseNotes = @"
## ones-timefiller $tag

### 下载
- ``ones-timefiller.exe`` - Windows 可执行文件，无需安装 Python

### 使用方法
1. 下载 ``ones-timefiller.exe``
2. 在同目录下创建 ``config.json``（参考 ``config.example.json``）
3. 双击运行或在终端中执行
"@

gh release create $tag $exePath --title "ones-timefiller $tag" --notes $releaseNotes

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[OK] 发布成功! $tag" -ForegroundColor Green
} else {
    Write-Error "gh release create 失败"
    exit 1
}
