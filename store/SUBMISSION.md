# Edge Add-ons / Chrome Web Store Submission Guide (商店发布指南)

This document contains all bilingual (English & Simplified Chinese) texts and metadata required for submitting **ONES Helper (ONES 工时助手)** v1.0.11 to the Microsoft Edge Add-ons Store and Chrome Web Store.

---

## Files / 提交素材清单

| File | Purpose | Specs |
|---|---|---|
| `../extension/icons/icon128.png` | Extension logo (reused from extension) | 128x128 PNG |
| `promo_small_440x280.png` | Small promotional tile | 440x280 PNG |
| `promo_large_1400x560.png` | Large promotional tile | 1400x560 PNG |
| `screenshot1_1280x800.png` | Screenshot | 1280x800 PNG |
| `PRIVACY.md` | Privacy policy | Markdown |

---

## Extension Basic Info / 扩展基本信息

### Extension Name / 插件名称

**English**:
```text
ONES Hours Helper
```

**Chinese (Simplified)**:
```text
ONES 工时助手
```

---

## Description / 商店详细描述

### English Version (英文版)

```text
ONES Hours Helper is a productivity extension for ONES project management platform users. It automatically reads your browser login session to plan, distribute, and submit work hours — no cookie copying required.

★ Why install it
Filling daily work hours in ONES is tedious and error-prone. This extension provides a standalone panel that fetches your tasks and attendance data, distributes hours across working days with one click, and submits them in bulk — saving you minutes every day.

★ Key Features
• Auto-reads browser login cookies — zero manual setup
• Standalone dashboard with 6-step workflow: fetch data → plan hours → preview distribution → submit → status transition → done
• Calendar view showing daily hour distribution (empty/partial/full)
• Auto token refresh via background service worker (every 30 min)
• Three-stage task status transition: To-Do → In-Progress → Review → Done
• Optional Beisen attendance integration for overtime hours
• Displays real user name (not UUID) via ONES GraphQL currentUser query
• Bilingual UI (English & Simplified Chinese) auto-matched with browser locale
• Preview mode to dry-run the entire flow without real submission
• 100% local processing — no third-party servers

★ How to use
1. Log in to ONES (ones.reachauto.com) in your browser
2. Click the extension toolbar icon → "Open Hours Panel"
3. Select target month, the dashboard auto-loads tasks and filled hours
4. Adjust hours per task, click "Next" through the 6-step flow
5. Hours are submitted and task statuses transitioned automatically

★ Permissions
• cookies — reserved for compatibility; main flow uses fetch + credentials: include to auto-send cookies
• storage — save user configuration (workflow, holidays, cached user name, etc.)
• alarms — schedule periodic token expiration check
• host_permissions: ones.reachauto.com, www.italent.cn — call ONES and Beisen APIs

★ Notes
• Must be logged in to ONES first
• Beisen attendance integration is optional (requires manual cookie paste)
• Token auto-refresh may fail if the session has fully expired — re-login to ONES to fix

★ Open source
https://github.com/duying0425/ones-helper
```

### Chinese Version (中文版)

```text
ONES 工时助手是一款面向 ONES 项目管理平台用户的效率插件。自动读取浏览器登录态，完成工时规划、分配与提交，无需手动复制 Cookie。

★ 为什么选择它
在 ONES 中逐日填写工时既繁琐又容易出错。本插件提供独立面板，自动获取任务和考勤数据，一键分配工时到工作日，批量提交，每天为你节省数分钟。

★ 核心功能
• 自动读取浏览器登录 Cookie — 零手动配置（基于 fetch + credentials: include，VPN/隐私环境也可用）
• 独立面板 6 步流程：获取数据 → 规划工时 → 预览分配 → 提交工时 → 状态流转 → 完成
• 日历视图展示每日工时分布（未填/部分/已满）
• background service worker 自动刷新 Token（每 30 分钟检查）
• 三阶段任务状态流转：未开始 → 进行中 → 审核中 → 已完成
• 可选北森考勤系统集成，自动获取加班工时
• 通过 ONES GraphQL currentUser 查询显示用户真实姓名（而非 UUID 短码）
• 中英文双语界面，根据浏览器语言自动切换
• 预览模式可走完全流程但不真实提交，便于核对
• 100% 本地处理，绝不上传任何用户数据

★ 使用方法
1. 在浏览器中登录 ONES（ones.reachauto.com）
2. 点击插件工具栏图标 → "打开工时填写面板"
3. 选择目标月份，面板自动加载任务和已填工时
4. 调整每个任务的工时，点击"下一步"走完 6 步流程
5. 工时自动提交，任务状态自动流转

★ 权限说明
• cookies — 备用兼容；主流程已改用 fetch + credentials: include 自动带 Cookie
• storage — 保存用户配置（工作流、节假日、缓存的用户姓名等）
• alarms — 定时检查 Token 过期
• host_permissions: ones.reachauto.com, www.italent.cn — 调用 ONES 与北森 API

★ 注意事项
• 需先在浏览器登录 ONES 账号
• 北森考勤集成通过浏览器自动带 Cookie，需先登录 www.italent.cn/portal
• 若会话已完全过期，Token 自动刷新可能失败 — 重新登录 ONES 即可恢复

★ 开源地址
https://github.com/duying0425/ones-helper
```

---

## Search terms / 搜索关键词

(Up to 7 terms, max 30 chars each)

**English**:
```text
ONES hours
work hours filler
timesheet automation
ONES time tracking
project hours planner
ones reachauto
worklog submitter
```

**Chinese (Simplified)**:
```text
ONES 工时
工时填写
工时自动化
工时计划
项目工时
工时助手
工时提交
```

---

## Privacy & Permissions / 隐私与权限说明

### Single Purpose Description / 单一用途说明

**English**:
```text
This extension allows users to automatically plan, distribute, and submit work hours to the ONES project management platform, and to transition task statuses (To-Do → In-Progress → Done). It operates on ones.reachauto.com and optionally cloud.italent.cn domains, reads the logged-in user's session cookies to authenticate API calls to ONES and Beisen endpoints, and saves user configuration locally. No data is collected, stored, or transmitted to any third party.
```

**Chinese (Simplified)**:
```text
本扩展的单一用途是帮助用户自动规划、分配并向 ONES 项目管理平台提交工时，以及流转任务状态（未开始 → 进行中 → 已完成）。本扩展在 ones.reachauto.com 和可选的 cloud.italent.cn 域名运行，读取登录态 Cookie 以调用 ONES 与北森官方 API，并在本地保存用户配置。扩展绝不收集、存储或向任何第三方传输用户数据。
```

### Justifications / 权限声明理由

#### cookies permission justification
**English**:
```text
Reserved for compatibility. The main authentication flow uses fetch with credentials: "include" to let the browser automatically attach the user's existing ONES login cookies (ones-lt, ones-ids-sid, ones-uid) when calling ONES GraphQL, OQL, and status transition endpoints. The cookies permission is kept as a fallback for diagnostic or future use. Without valid cookies, the ONES API returns 401 Unauthorized. All cookies remain in the browser and are sent exclusively to ones.reachauto.com.
```

**Chinese (Simplified)**:
```text
备用兼容权限。主认证流程使用 fetch + credentials: "include"，由浏览器在调用 ONES GraphQL、OQL 和状态流转 API 时自动附带用户已登录的 Cookie（ones-lt、ones-ids-sid、ones-uid）。cookies 权限仅作为诊断或未来用途的兜底保留。若无有效 Cookie，ONES API 将返回 401 认证失败。所有 Cookie 均保留在浏览器本地，仅随请求发送至 ones.reachauto.com 官方服务器。
```

#### storage permission justification
**English**:
```text
Used to save user-configurable settings (workflow definitions, holiday patches, Beisen configuration, daily overtime limit, cached ONES user name for popup display) via chrome.storage.local. The extension does not sync this data to any cloud account and the data is fully under user control.
```

**Chinese (Simplified)**:
```text
用于通过 chrome.storage.local 保存用户可配置的设置（工作流定义、节假日补丁、北森配置、每日加班上限、弹窗显示用的 ONES 用户姓名缓存等）。扩展不会将此数据同步到任何云账户，数据完全由用户控制。
```

#### alarms permission justification
**English**:
```text
Used to schedule a periodic check (every 30 minutes) for ONES token expiration, so the extension can auto-refresh the token before it expires without requiring manual user action.
```

**Chinese (Simplified)**:
```text
用于定时（每 30 分钟）检查 ONES Token 是否即将过期，以便在过期前自动刷新，无需用户手动操作。
```

#### Host Permissions (`https://ones.reachauto.com/*`, `https://cloud.italent.cn/*`, `https://www.italent.cn/*`) justification
**English**:
```text
Required to (1) read the ONES session cookie for API authentication, (2) call ONES GraphQL/OQL/status transition APIs, (3) submit work hours via addManhour mutation, and (4) optionally call the Beisen attendance API to fetch overtime data when the user has configured the Italent cookie.
```

**Chinese (Simplified)**:
```text
用于 (1) 读取 ONES 会话 Cookie 进行 API 认证，(2) 调用 ONES GraphQL/OQL/状态流转 API，(3) 通过 addManhour 提交工时，及 (4) 在用户配置北森 Cookie 后可选地调用北森考勤 API 获取加班数据。
```

---

## Privacy Policy URL / 隐私政策链接

```text
https://github.com/duying0425/ones-helper/blob/master/store/PRIVACY.md
```

---

## Notes for Certification / 给审核人员的备注

**English**:
```text
This extension plans and submits work hours to the ONES project management platform, and transitions task statuses.

Test steps:
1. Log in to https://ones.reachauto.com in the browser.
2. Click the extension toolbar icon. The popup should show "Logged in" status.
3. Click "Open Hours Panel" to open the dashboard in a new tab.
4. Select a month, the dashboard auto-loads tasks and filled hours.
5. Adjust hours per task, click "Next" through the 6-step flow.
6. Hours are submitted to ONES and task statuses transitioned.

Features in v1.0.11:
- Auto-reads browser cookies via fetch + credentials: include (works in VPN/privacy mode).
- 6-step standalone dashboard with calendar preview.
- Three-stage task status transition (To-Do → In-Progress → Done).
- Bilingual (English & Simplified Chinese) UI.
- Optional Beisen attendance integration for overtime hours.
- Popup displays real user name (not UUID) via ONES GraphQL currentUser.
- Login status reflected via extension icon badge (no desktop notifications).
```

**Chinese (Simplified)**:
```text
本扩展用于向 ONES 项目管理平台提交工时，并流转任务状态。

测试步骤：
1. 在浏览器中登录 https://ones.reachauto.com。
2. 点击插件工具栏图标，弹窗应显示"已登录"状态（含用户姓名）。
3. 点击"打开工时填写面板"在新标签页打开 dashboard。
4. 选择月份，面板自动加载任务和已填工时。
5. 调整每个任务的工时，点击"下一步"走完 6 步流程。
6. 工时自动提交到 ONES，任务状态自动流转。

v1.0.11 功能：
- 基于 fetch + credentials: include 自动带 Cookie（VPN/隐私环境也可用）。
- 独立面板 6 步流程，含日历预览。
- 三阶段任务状态流转（未开始 → 进行中 → 已完成）。
- 中英文双语界面。
- 可选北森考勤集成，自动获取加班工时。
- 弹窗显示用户真实姓名（通过 ONES GraphQL currentUser 查询，非 UUID）。
- 登录状态通过扩展图标 badge 颜色提示（不弹桌面通知）。
```

---

## Category / 分类

```text
Productivity / 生产力
```

---

## Submission History / 发布历史

| Version | Date | Status | Highlights |
|---|---|---|---|
| 1.0.0 | 2026-07-31 | Ready for submission | Initial release: auto cookie reading, 6-step dashboard, workflow transitions, bilingual i18n |
| 1.0.11 | 2026-07-31 | Ready for submission | Switch to fetch + credentials: include (VPN-compatible), remove notifications permission, add user name display via GraphQL currentUser, badge-based login status |
