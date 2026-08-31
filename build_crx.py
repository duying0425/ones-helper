#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build CRX package and update.xml for Microsoft Edge self-hosted distribution.
"""

import os
import sys
import json
import shutil
import hashlib
import subprocess
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

PROJECT_DIR = Path(__file__).resolve().parent
EXTENSION_DIR = PROJECT_DIR / "extension"
DIST_DIR = PROJECT_DIR / "dist"
KEY_FILE = PROJECT_DIR / "ones-helper.pem"
EDGE_PATH = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")

def ensure_key():
    if not KEY_FILE.exists():
        print(f"[INFO] Generating new private key: {KEY_FILE}")
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pem_bytes = key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )
        with open(KEY_FILE, "wb") as f:
            f.write(pem_bytes)
    else:
        print(f"[INFO] Using existing private key: {KEY_FILE}")

    with open(KEY_FILE, "rb") as f:
        key = serialization.load_pem_private_key(f.read(), password=None)

    der = key.public_key().public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )
    digest = hashlib.sha256(der).hexdigest()
    ext_id = "".join(chr(ord('a') + int(c, 16)) for c in digest[:32])
    return ext_id

def get_manifest_version():
    manifest_path = EXTENSION_DIR / "manifest.json"
    with open(manifest_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("version", "1.0.0")

def pack_crx(ext_id, version):
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    
    # msedge command line packing
    cmd = [
        str(EDGE_PATH),
        f"--pack-extension={EXTENSION_DIR}",
        f"--pack-extension-key={KEY_FILE}",
        "--no-message-box"
    ]
    print(f"[INFO] Running: {' '.join(cmd)}")
    res = subprocess.run(cmd, capture_output=True, text=True)
    
    # msedge generates extension.crx adjacent to extension directory (i.e. in PROJECT_DIR)
    generated_crx = PROJECT_DIR / "extension.crx"
    if not generated_crx.exists():
        # Check inside extension dir
        if (EXTENSION_DIR / "extension.crx").exists():
            generated_crx = EXTENSION_DIR / "extension.crx"
        elif (PROJECT_DIR / "ones-helper.crx").exists():
            generated_crx = PROJECT_DIR / "ones-helper.crx"
            
    if not generated_crx.exists():
        raise RuntimeError(f"CRX file was not generated! stderr: {res.stderr}")

    target_version_crx = DIST_DIR / f"ones-helper-v{version}.crx"
    target_latest_crx = DIST_DIR / "ones-helper.crx"

    shutil.copy2(generated_crx, target_version_crx)
    shutil.copy2(generated_crx, target_latest_crx)
    os.remove(generated_crx)
    
    # Also clean any extra pem msedge might have created if KEY_FILE was named differently
    extra_pem = PROJECT_DIR / "extension.pem"
    if extra_pem.exists() and extra_pem != KEY_FILE:
        os.remove(extra_pem)

    print(f"[OK] Generated {target_version_crx.name} ({os.path.getsize(target_version_crx):,} bytes)")
    print(f"[OK] Generated {target_latest_crx.name}")
    return target_latest_crx, target_version_crx

def generate_update_xml(ext_id, version):
    xml_content = f"""<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='{ext_id}'>
    <updatecheck codebase='https://edge.tmhcorps.cn/ones-helper.crx' version='{version}' />
  </app>
</gupdate>
"""
    update_xml_path = DIST_DIR / "update.xml"
    with open(update_xml_path, "w", encoding="utf-8") as f:
        f.write(xml_content)
    print(f"[OK] Generated {update_xml_path.name}")
    return update_xml_path

def generate_install_scripts(ext_id):
    # Bat script
    bat_content = f"""@echo off
chcp 65001 >nul
echo ========================================================
echo   ONES Helper Edge 插件配置 (normal_installed 模式)
echo ========================================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [提示] 正在请求管理员权限...
    powershell -Command "Start-Process '%~0' -Verb RunAs"
    exit /b
)

set EXT_ID={ext_id}
set KEY=HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge\\ExtensionSettings
set VALUE={{\\"installation_mode\\":\\"normal_installed\\",\\"update_url\\":\\"https://edge.tmhcorps.cn/update.xml\\",\\"override_update_url\\":true}}

reg add "%KEY%" /v "%EXT_ID%" /t REG_SZ /d "%VALUE%" /f

if %errorLevel% equ 0 (
    echo.
    echo [成功] 插件配置已写入注册表！
    echo [插件 ID] %EXT_ID%
    echo [更新地址] https://edge.tmhcorps.cn/update.xml
    echo.
    echo 请重启 Edge 浏览器，或在 Edge 访问 edge://policy 点击"重新加载策略"。
) else (
    echo.
    echo [失败] 写入注册表失败，请确认是否以管理员身份运行。
)

echo.
pause
"""
    bat_path = DIST_DIR / "install_extension.bat"
    with open(bat_path, "w", encoding="utf-8") as f:
        f.write(bat_content)
    print(f"[OK] Generated {bat_path.name}")

    # PS1 script
    ps1_content = f"""# ONES Helper Edge 扩展安装策略 (normal_installed)
# 需要管理员权限运行

$extId = "{ext_id}"
$json = '{{"installation_mode":"normal_installed","update_url":"https://edge.tmhcorps.cn/update.xml","override_update_url":true}}'
$path = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge\\ExtensionSettings"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {{
    Write-Warning "请以管理员身份运行 PowerShell"
    exit 1
}}

if (-not (Test-Path $path)) {{
    New-Item -Path $path -Force | Out-Null
}}

Set-ItemProperty -Path $path -Name $extId -Value $json
Write-Host "[OK] ONES Helper 策略配置成功 (ID: $extId)" -ForegroundColor Green
Write-Host "请重启 Edge 浏览器或在 edge://policy 点击「重新加载策略」。" -ForegroundColor Cyan
"""
    ps1_path = DIST_DIR / "install_extension.ps1"
    with open(ps1_path, "w", encoding="utf-8") as f:
        f.write(ps1_content)
    print(f"[OK] Generated {ps1_path.name}")

def main():
    ext_id = ensure_key()
    version = get_manifest_version()
    print(f"\nExtension ID : {ext_id}")
    print(f"Version      : {version}\n")
    
    pack_crx(ext_id, version)
    generate_update_xml(ext_id, version)
    generate_install_scripts(ext_id)
    print("\n[ALL DONE] All build assets created in dist/")

if __name__ == "__main__":
    main()
