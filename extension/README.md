# ONES Helper - 浏览器插件

一个 Manifest V3 的 Chrome/Edge 插件，自动读取浏览器已登录的 ONES 会话，提供独立面板完成工时规划、提交与任务状态流转，**无需手动复制 Cookie**。

## 特性

- **Cookie 零手动**：基于 `fetch` + `credentials: "include"` 让浏览器自动带 Cookie，不依赖 `chrome.cookies` API（VPN/隐私环境也能用）
- **Token 自动刷新**：background service worker 每 30 分钟检查一次，过期前 5 分钟自动刷新
- **独立面板**：6 步流程（获取数据 → 规划工时 → 预览分配 → 提交工时 → 状态流转 → 完成），含日历视图、任务表格、提交日志、流转候选列表
- **配置可视化**：workflow 状态流转配置支持动态增删步骤，节假日 JSON 编辑，一键导出 config.json
- **北森考勤集成**：登录 www.italent.cn/portal 后自动获取加班工时
- **用户姓名显示**：通过 ONES GraphQL `currentUser` 查询真实姓名，弹窗显示「已登录 · 杜莹芳」而非用户 UUID 短码
- **中英文双语**：根据浏览器语言自动切换

## 安装（开发者模式）

1. 打开 Chrome/Edge：地址栏访问 `chrome://extensions/`（Edge 是 `edge://extensions/`）
2. 右上角打开「开发者模式」
3. 点击「加载已解压的扩展程序」/「加载解压缩的扩展」
4. 选择本目录（`extension/`）

> Edge 用户提示：因为是未签名扩展，每次启动 Edge 可能弹一次「禁用开发者扩展」提示，点「允许」保留即可。

## 使用

### 1. 弹窗快捷入口

点击工具栏图标，弹窗显示当前认证状态（已登录 / Token 过期 / 未登录），并提供三个入口：

- **打开工时填写面板**：在新标签页打开独立 dashboard
- **刷新认证状态**：重新检查 Cookie 与 Token
- **配置选项**：打开配置页

未登录时弹窗底部会显示「访问 ONES」链接，方便快速跳转登录。登录状态变化时扩展图标 badge 会更新（绿色=全部已登录，橙色=仅 ONES 已登录，红色=未登录），不再弹桌面通知。

### 2. 工时填写面板（dashboard）

6 步流程：

| 步骤 | 说明 |
| --- | --- |
| 1. 获取数据 | 并行加载考勤加班、本月已填工时、活跃任务列表，显示月度容量摘要 |
| 2. 规划工时 | 表格形式输入每个任务的本次工时；月度满后自动切换到加班工时输入 |
| 3. 预览分配 | 日历视图展示每天工时分布（未填/部分/已满）+ 工时明细列表 |
| 4. 提交工时 | 批量调用 GraphQL `addManhour` 提交，实时显示成功/失败日志 |
| 5. 状态流转 | 三阶段候选列表：未开始→进行中、进行中→提交审核、完成审核中→已完成 |
| 6. 完成 | 刷新最终状态，显示本月汇总表（任务/状态/已填/剩余） |

**预览模式**：点击右下角「预览模式」按钮可走完全流程但不真实提交，用于核对。

### 3. 配置页（options）

- **基础配置**：Team UUID、Org UUID（只读，自动读取）、每日加班上限
- **北森考勤**：标准在勤时长（其余字段由扩展自动探测，无需填写）
- **节假日补丁**：JSON 格式 `{ off: [...], on: [...], remove_off: [...], remove_on: [...] }`
- **状态流转工作流**：每个工作项类型定义从开始到终态的状态序列，可视化增删步骤
- **导出 config.json**：与 Python 版配置兼容，导出时自动移除 auth_token

### 4. 重新测试 Cookie 读取登录

扩展不缓存"是否已登录"的状态——每次打开弹窗、点击「刷新认证状态」、或每次浏览器启动后 service worker 唤醒时，都会重新发起探测请求（fetch ONES 主页看是否重定向到登录页）。所以：

- **重启浏览器**：会重新触发 service worker 初始化，自动探测一次登录状态并更新 badge
- **点击「刷新认证状态」**：立即重新探测，无需重启浏览器
- **在 ONES 网页完成登录后**：扩展会通过 `chrome.tabs.onUpdated` 监听标签页跳转，自动重新探测并更新 badge（不再弹桌面通知）

Cookie 本身不会因为重启浏览器而变化（除非你在 ONES 网页点退出登录），所以"重启浏览器 = 重新读取 cookie 登录"的说法不完全准确——重启只是重新触发了一次探测请求，结果取决于浏览器中 Cookie 是否仍然有效。

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `cookies` | 备用：读取 `ones.reachauto.com` 的 Cookie（主流程已改用 `fetch` + `credentials: include`，此权限仅作兼容保留） |
| `storage` | 保存用户配置（workflow、节假日、北森 cookie、用户姓名缓存等）到 `chrome.storage.local` |
| `alarms` | 定时检查 Token 过期（每 30 分钟） |
| `host_permissions: https://ones.reachauto.com/*` | 调用 ONES GraphQL / OQL / 状态流转 API，并通过 `credentials: include` 自动带 Cookie |
| `host_permissions: https://cloud.italent.cn/*` / `https://www.italent.cn/*` | 调用北森考勤接口获取加班数据 |

> 已移除 `notifications` 权限：登录状态变化通过扩展图标 badge 颜色提示，不再弹桌面通知。

## 文件结构

```
extension/
├── manifest.json                # MV3 配置（i18n + 权限声明）
├── background.js                # service worker：Token 自动刷新 + 登录状态监听 + badge 更新
├── popup.html / src/popup.js    # 弹窗：认证状态（含用户姓名）+ 入口按钮
├── options.html / src/options.js  # 配置页：workflow 可视化编辑
├── dashboard.html / src/dashboard.js  # 独立面板：6 步工时填写流程
├── _locales/                    # 国际化
│   ├── zh_CN/messages.json
│   └── en/messages.json
├── icons/                       # 16/32/48/128 四尺寸图标
└── src/
    ├── api.js                   # ONES / 北森 HTTP 封装（含 fetchOnesUserName）
    ├── config.js                # chrome.storage.local 配置管理
    ├── holidays.js              # 节假日数据 + 工作日计算
    ├── distribute.js            # 工时分配算法
    ├── workflow.js              # 状态流转配置解析
    ├── engine.js                # 业务编排（含 checkAuth 返回 userName）
    ├── i18n.js                  # i18n 辅助
    └── styles.css               # 统一设计语言
```

## 修改代码后如何生效

每次修改 `extension/` 下的文件后，需要去扩展管理页点对应卡片上的 ↻「重新加载」按钮，新代码才会生效。弹窗若有缓存问题，按 Ctrl+F5 强制刷新。

## 与 Python 版的关系

本扩展是 [ones_timefiller.py](../ones_timefiller.py) 的浏览器插件版本，业务逻辑完全等价：

- 工时分配算法、状态流转 workflow、节假日计算、北森考勤解析均 1:1 移植
- GraphQL / OQL / 状态流转 / addManhour 等所有 API 端点 URL 与 Python 原版完全一致
- `config.json` 格式兼容，可在配置页一键导出供 Python 版使用
- Python 版作为无浏览器环境的 fallback 保留
- 扩展版新增功能：弹窗显示用户真实姓名（通过 GraphQL `currentUser` 查询，Python 原版只显示 UUID）

## 已知限制

- 仅在已登录 `ones.reachauto.com` 的浏览器中可用
- ONES 内部 API 变更可能导致失效
- service worker 在 MV3 下不常驻，每 30 分钟由 alarms 唤醒检查 Token
- 北森考勤 Cookie 通过 `credentials: include` 自动带，需先在浏览器登录 www.italent.cn/portal

## 测试

单元测试位于仓库根目录的 `tests/` 下，无需浏览器环境：

```bash
# 在仓库根目录运行
node tests/test.js
```

测试使用 Node.js `vm` 模块加载本目录下的实际源码进行纯函数验证，覆盖 holidays / distribute / workflow / config / api / i18n / manifest / locales 共 75 个用例。
