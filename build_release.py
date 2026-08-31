#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build all release packages for both ONES Helper & MinuteExport,
and generate the Multi-Extension Hub landing page for edge.tmhcorps.cn.
"""

import os
import sys
import json
import shutil
import hashlib
import zipfile
import datetime
import subprocess
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

PROJECT_DIR = Path(__file__).resolve().parent
EXTENSION_DIR = PROJECT_DIR / "extension"
DIST_DIR = PROJECT_DIR / "dist"
KEY_FILE = PROJECT_DIR / "ones-helper.pem"
EDGE_PATH = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")

MINUTE_EXPORT_DIR = Path(r"C:\Users\duyin\Desktop\project\MinuteExport\extension")

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

def get_manifest_version(manifest_dir):
    manifest_path = manifest_dir / "manifest.json"
    with open(manifest_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("version", "1.0.0")

def pack_zip(src_dir, output_name):
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = DIST_DIR / output_name
    if zip_path.exists(): os.remove(zip_path)

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(src_dir):
            for f in files:
                full_path = Path(root) / f
                arcname = full_path.relative_to(src_dir)
                zf.write(full_path, arcname)

    print(f"[OK] Packaged ZIP: {zip_path.name} ({os.path.getsize(zip_path):,} bytes)")
    return zip_path

def pack_crx(ext_id, version):
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    if not EDGE_PATH.exists():
        print(f"[WARN] Edge executable not found, skipping CRX.")
        return None

    cmd = [
        str(EDGE_PATH),
        f"--pack-extension={EXTENSION_DIR}",
        f"--pack-extension-key={KEY_FILE}",
        "--no-message-box"
    ]
    subprocess.run(cmd, capture_output=True, text=True)

    generated_crx = PROJECT_DIR / "extension.crx"
    if not generated_crx.exists():
        if (EXTENSION_DIR / "extension.crx").exists():
            generated_crx = EXTENSION_DIR / "extension.crx"
        elif (PROJECT_DIR / "ones-helper.crx").exists():
            generated_crx = PROJECT_DIR / "ones-helper.crx"

    if generated_crx.exists():
        target_version_crx = DIST_DIR / f"ones-helper-v{version}.crx"
        target_latest_crx = DIST_DIR / "ones-helper.crx"
        shutil.copy2(generated_crx, target_version_crx)
        shutil.copy2(generated_crx, target_latest_crx)
        os.remove(generated_crx)

        extra_pem = PROJECT_DIR / "extension.pem"
        if extra_pem.exists() and extra_pem != KEY_FILE:
            os.remove(extra_pem)

        print(f"[OK] Packaged CRX: {target_latest_crx.name} ({os.path.getsize(target_latest_crx):,} bytes)")
        return target_latest_crx
    return None

def generate_index_html(ones_version, minute_version):
    today = datetime.date.today().strftime("%Y-%m-%d")
    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Edge 插件中心 - TMH Corps</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🧩</text></svg>">
  <style>
    :root {{
      --primary: #165DFF;
      --primary-hover: #0E4DD8;
      --edge-color: #0078D4;
      --edge-hover: #0060B2;
      --success: #00B42A;
      --warning: #FF7D00;
      --bg: #F7F8FA;
      --card-bg: #FFFFFF;
      --text: #1D2129;
      --text-secondary: #4E5969;
      --text-disabled: #86909C;
      --border: #E5E6EB;
      --radius: 12px;
      --shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 40px 20px;
      display: flex;
      justify-content: center;
    }}
    .wrapper {{
      max-width: 920px;
      width: 100%;
    }}
    .top-nav {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }}
    .top-nav a {{
      color: var(--primary);
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }}
    .top-nav a:hover {{ text-decoration: underline; }}
    .hero {{
      text-align: center;
      margin-bottom: 36px;
    }}
    .hero .logo {{
      width: 60px;
      height: 60px;
      margin: 0 auto 16px;
      background: linear-gradient(135deg, #0078D4 0%, #165DFF 100%);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 30px;
      box-shadow: 0 8px 24px rgba(0, 120, 212, 0.25);
    }}
    .hero h1 {{
      font-size: 26px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 8px;
    }}
    .hero p {{
      color: var(--text-secondary);
      font-size: 14px;
    }}

    /* 插件列表网格 */
    .extensions-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
      gap: 20px;
      margin-bottom: 36px;
    }}
    .ext-card {{
      background: var(--card-bg);
      border-radius: var(--radius);
      border: 1px solid var(--border);
      padding: 24px;
      box-shadow: var(--shadow);
      display: flex;
      flex-direction: column;
      transition: transform 0.2s, box-shadow 0.2s;
    }}
    .ext-card:hover {{
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
    }}
    .ext-header {{
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 14px;
    }}
    .ext-icon {{
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      flex-shrink: 0;
    }}
    .ext-icon-ones {{ background: #E8F3FF; color: #165DFF; }}
    .ext-icon-minute {{ background: #E8FFEA; color: #00B42A; }}

    .ext-title-area {{ flex: 1; min-width: 0; }}
    .ext-title {{
      font-size: 17px;
      font-weight: 600;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    .tag {{
      display: inline-block;
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 500;
    }}
    .tag-blue {{ background: #E8F3FF; color: #165DFF; }}
    .tag-green {{ background: #E8FFEA; color: #00B42A; }}
    .tag-orange {{ background: #FFF7E8; color: #FF7D00; }}
    .ext-meta {{
      font-size: 12px;
      color: var(--text-disabled);
      margin-top: 2px;
    }}
    .ext-desc {{
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.6;
      margin-bottom: 18px;
      flex: 1;
    }}
    .ext-features {{
      background: #FAFBFC;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 18px;
      list-style: none;
    }}
    .ext-features li {{
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
    }}
    .ext-features li:last-child {{ margin-bottom: 0; }}
    .ext-features li::before {{
      content: "•";
      color: var(--primary);
      font-weight: bold;
    }}

    .action-group {{
      display: flex;
      flex-direction: column;
      gap: 8px;
    }}
    .action-row {{
      display: flex;
      gap: 8px;
    }}
    .btn {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 9px 14px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      gap: 6px;
    }}
    .btn-store {{
      background: var(--edge-color);
      color: white;
      width: 100%;
    }}
    .btn-store:hover {{ background: var(--edge-hover); }}
    .btn-beta {{
      background: #F2F3F5;
      color: var(--text);
      border: 1px solid var(--border);
      flex: 1;
    }}
    .btn-beta:hover {{ background: #E5E6EB; color: var(--primary); }}
    .btn-crx {{
      background: #F2F3F5;
      color: var(--text-secondary);
      border: 1px solid var(--border);
      padding: 9px 12px;
    }}
    .btn-crx:hover {{ background: #E5E6EB; }}

    /* 安装说明 */
    .guide-section {{
      background: var(--card-bg);
      border-radius: var(--radius);
      border: 1px solid var(--border);
      padding: 24px;
      box-shadow: var(--shadow);
      margin-bottom: 32px;
    }}
    .guide-section h3 {{
      font-size: 15px;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    .guide-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }}
    .guide-card {{
      background: #FAFBFC;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }}
    .guide-card h4 {{
      font-size: 13px;
      color: var(--text);
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }}
    .guide-card p, .guide-card ol {{
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.7;
    }}
    .guide-card ol {{ padding-left: 18px; }}
    .guide-card code {{
      background: #FFFFFF;
      border: 1px solid var(--border);
      padding: 1px 4px;
      border-radius: 3px;
      font-family: Consolas, Monaco, monospace;
      color: #1D2129;
    }}

    .footer {{
      text-align: center;
      font-size: 12px;
      color: var(--text-disabled);
      margin-top: 36px;
    }}
  </style>
</head>
<body>
  <div class="wrapper">
    <!-- 顶部导航 -->
    <div class="top-nav">
      <a href="https://tmhcorps.cn">← 返回 天枢门户 (tmhcorps.cn)</a>
      <span style="font-size:12px; color:var(--text-disabled);">更新时间：{today}</span>
    </div>

    <!-- Hero 头部 -->
    <div class="hero">
      <div class="logo">🧩</div>
      <h1>Edge 插件中心</h1>
      <p>自研高效办公与协同扩展 · 官方商店正式版与最新测试版下载</p>
    </div>

    <!-- 插件列表网格 -->
    <div class="extensions-grid">
      <!-- 插件 1：ONES 工时助手 -->
      <div class="ext-card">
        <div class="ext-header">
          <div class="ext-icon ext-icon-ones">⏱️</div>
          <div class="ext-title-area">
            <div class="ext-title">
              ONES 工时助手
              <span class="tag tag-blue">v{ones_version}</span>
            </div>
            <div class="ext-meta">ONES 项目管理 · 智能工时提交</div>
          </div>
        </div>
        <p class="ext-desc">
          自动读取浏览器登录态，智能分配月度工时到工作日并批量提交，完美支持北森考勤联动与日历可视化预览。
        </p>
        <ul class="ext-features">
          <li>免手动填 Cookie，自动同步浏览器会话</li>
          <li>智能均分工时，一键多任务批量提交</li>
          <li>联动北森考勤接口，自动统计加班时长</li>
        </ul>
        <div class="action-group">
          <a class="btn btn-store" href="https://microsoftedge.microsoft.com/addons/detail/dblhoomdiejamklcoaemadceniagjffk" target="_blank">
            🛒 前往 Edge 商店安装 (正式版 · 自动更新)
          </a>
          <div class="action-row">
            <a class="btn btn-beta" href="/ones-helper-extension.zip" download>
              📥 下载测试版 ZIP (v{ones_version})
            </a>
            <a class="btn btn-crx" href="/ones-helper.crx" download title="下载 CRX 安装包">
              CRX
            </a>
          </div>
        </div>
      </div>

      <!-- 插件 2：飞书妙记导出 -->
      <div class="ext-card">
        <div class="ext-header">
          <div class="ext-icon ext-icon-minute">📝</div>
          <div class="ext-title-area">
            <div class="ext-title">
              飞书妙记导出
              <span class="tag tag-green">v{minute_version}</span>
            </div>
            <div class="ext-meta">飞书办公 · 会议纪要 Markdown 沉淀</div>
          </div>
        </div>
        <p class="ext-desc">
          一键导出飞书妙记会议转写为标准 Markdown 格式，自动识别会议名称、发言人与时间戳，便于知识库沉淀。
        </p>
        <ul class="ext-features">
          <li>一键提取完整逐字稿与发言人信息</li>
          <li>智能保留会议标题与时间格式</li>
          <li>无任何第三方服务端转发，100% 本地安全处理</li>
        </ul>
        <div class="action-group">
          <a class="btn btn-store" href="https://microsoftedge.microsoft.com/addons/detail/iinoimcblleoeakcbcaihcmfdmopbfgb" target="_blank">
            🛒 前往 Edge 商店安装 (正式版 · 自动更新)
          </a>
          <div class="action-row">
            <a class="btn btn-beta" href="/minute-export-extension.zip" download>
              📥 下载测试版 ZIP (v{minute_version})
            </a>
          </div>
        </div>
      </div>
    </div>

    <!-- 安装与更新指南 -->
    <div class="guide-section">
      <h3>📖 安装与更新使用指南</h3>
      <div class="guide-grid">
        <div class="guide-card">
          <h4>🌟 官方商店正式版 (推荐日常使用)</h4>
          <p>
            直接点击卡片上的 <b>「前往 Edge 商店安装」</b> 按钮添加到 Edge。<br />
            <b>自动更新</b>：后续只要商店发布新版，Edge 浏览器将在后台<b>全自动静默升级</b>，无需任何手动维护。
          </p>
        </div>
        <div class="guide-card">
          <h4>🧪 私有测试版 (解压加载 / 抢先体验)</h4>
          <ol>
            <li>下载测试版 ZIP 包解压到本地固定文件夹。</li>
            <li>在 Edge 地址栏输入 <code>edge://extensions/</code> 打开扩展管理。</li>
            <li>开启 <b>「开发人员模式」</b>，点击 <b>「加载解压缩的扩展」</b> 选择解压目录。</li>
            <li><b>后续更新</b>：重新下载 ZIP 覆盖本地文件夹，在扩展管理页点击 <b>🔄 刷新</b> 即可。</li>
          </ol>
        </div>
      </div>
    </div>

    <div class="footer">
      TMH Corporation · 天溟浩瀚 · edge.tmhcorps.cn
    </div>
  </div>
</body>
</html>
"""
    out_path = DIST_DIR / "index.html"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"[OK] Generated {out_path.name}")
    return out_path

def generate_update_xml(ext_id, version):
    xml_content = f"""<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='{ext_id}'>
    <updatecheck codebase='https://edge.tmhcorps.cn/ones-helper.crx' version='{version}' />
  </app>
</gupdate>
"""
    out_path = DIST_DIR / "update.xml"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(xml_content.strip() + "\n")
    print(f"[OK] Generated {out_path.name} (version {version})")
    return out_path

def generate_version_json(version):
    today = datetime.date.today().strftime("%Y-%m-%d")
    data = {
        "version": version,
        "release_date": today,
        "download_url": "https://edge.tmhcorps.cn/ones-helper-extension.zip",
        "crx_url": "https://edge.tmhcorps.cn/ones-helper.crx",
        "changelog": [
            "1. 修复第 4 步工时提交按钮状态卡死在'提交中'的问题",
            "2. 优化工时提交日志呈现与状态流转步骤的平滑交互",
            "3. 支持月份切换自动重载并重置步骤状态"
        ]
    }
    out_path = DIST_DIR / "version.json"
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"[OK] Generated {out_path.name} (version {version})")
    return out_path

def main():
    print("=== Building All Edge Extensions & Multi-Extension Hub ===")
    ext_id = ensure_key()
    ones_version = get_manifest_version(EXTENSION_DIR)
    minute_version = get_manifest_version(MINUTE_EXPORT_DIR)
    
    print(f"ONES Helper Version : {ones_version}")
    print(f"MinuteExport Version: {minute_version}\n")

    # Pack ONES Helper
    pack_zip(EXTENSION_DIR, "ones-helper-extension.zip")
    pack_zip(EXTENSION_DIR, f"ones-helper-extension-v{ones_version}.zip")
    pack_crx(ext_id, ones_version)

    # Pack MinuteExport
    pack_zip(MINUTE_EXPORT_DIR, "minute-export-extension.zip")

    # Generate Hub Index HTML, update.xml, and version.json
    generate_index_html(ones_version, minute_version)
    generate_update_xml(ext_id, ones_version)
    generate_version_json(ones_version)
    print("\n[ALL DONE] All extension assets & portal generated in dist/")

if __name__ == "__main__":
    main()
