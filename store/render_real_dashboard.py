import subprocess
import os
from PIL import Image

STORE_DIR = r"c:\Users\duyin\Desktop\ones-helper\store"
EXT_DIR = r"c:\Users\duyin\Desktop\ones-helper\extension"
HTML_PATH = os.path.join(STORE_DIR, "real_dashboard_preview.html")
OUT_PNG = os.path.join(STORE_DIR, "screenshot1_1280x800.png")

html_content = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>ONES 工时填写面板</title>
  <link rel="stylesheet" href="../extension/src/styles.css" />
  <style>
    body {
      padding: 24px 32px;
      max-width: 1240px;
      margin: 0 auto;
      background: var(--color-bg);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }

    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--color-border);
    }
    .topbar-left { display: flex; align-items: center; gap: 12px; }
    .topbar-left img { width: 32px; height: 32px; border-radius: 6px; }
    .topbar h1 { font-size: 20px; font-weight: 600; color: var(--color-text); }
    .topbar .right { display: flex; align-items: center; gap: 12px; }
    .month-picker { display: flex; align-items: center; gap: 6px; }
    .month-picker button { padding: 4px 10px; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: #fff; cursor: pointer; }
    .month-picker input { width: 105px; text-align: center; padding: 4px 8px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-size: 14px; font-weight: 600; }

    /* 步骤导航 */
    .steps {
      display: flex; gap: 8px; margin-bottom: 20px;
      background: var(--color-bg-card); padding: 10px 12px; border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
      box-shadow: var(--shadow-sm);
    }
    .step {
      flex: 1; padding: 8px 12px; text-align: center;
      border-radius: var(--radius-sm); font-size: 13px; font-weight: 500;
      color: var(--color-text-secondary);
      display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .step.active { background: var(--color-primary); color: white; }
    .step.done { background: #E8FFEA; color: var(--color-success); }
    .step-num {
      width: 20px; height: 20px; border-radius: 50%;
      background: #F2F3F5; color: var(--color-text-secondary);
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 600;
    }
    .step.active .step-num { background: rgba(255,255,255,0.3); color: white; }
    .step.done .step-num { background: var(--color-success); color: white; }

    /* 月度容量摘要 */
    .summary {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;
    }
    .summary .stat {
      background: var(--color-bg-card); border: 1px solid var(--color-border);
      border-radius: var(--radius-md); padding: 16px;
      box-shadow: var(--shadow-sm);
    }
    .summary .stat .label { font-size: 13px; color: var(--color-text-secondary); margin-bottom: 6px; }
    .summary .stat .value { font-size: 24px; font-weight: 700; color: var(--color-text); }
    .summary .stat .value.warn { color: var(--color-warning); }
    .summary .stat .value.ok { color: var(--color-success); }

    /* 主面板左右布局 */
    .dashboard-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;
    }
    
    .panel-card {
      background: var(--color-bg-card);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: 18px;
      box-shadow: var(--shadow-sm);
    }

    .panel-title {
      font-size: 15px; font-weight: 600; margin-bottom: 14px;
      display: flex; align-items: center; justify-content: space-between;
      color: var(--color-text);
    }

    /* 任务表格 */
    .task-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .task-table th, .task-table td { padding: 10px 8px; text-align: left; border-bottom: 1px solid var(--color-border); }
    .task-table th { background: #F7F8FA; color: var(--color-text-secondary); font-weight: 600; }
    .task-table tr:last-child td { border-bottom: none; }
    .task-key { font-family: monospace; font-weight: 600; color: var(--color-primary); }
    .task-name { font-weight: 500; color: var(--color-text); }
    
    /* 日历表格 */
    .calendar-grid {
      display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-top: 8px;
    }
    .cal-header { text-align: center; font-size: 12px; font-weight: 600; color: var(--color-text-secondary); padding: 4px 0; }
    .cal-cell {
      border: 1px solid var(--color-border); border-radius: 6px; padding: 6px; min-height: 52px;
      background: #fff; display: flex; flex-direction: column; justify-content: space-between;
    }
    .cal-cell.workday { background: #E8FFEA; border-color: #AFF0B5; }
    .cal-cell.weekend { background: #F7F8FA; color: var(--color-text-disabled); }
    .cal-date { font-size: 12px; font-weight: 600; }
    .cal-badge {
      font-size: 11px; font-weight: 600; padding: 2px 4px; border-radius: 4px; text-align: center;
    }
    .cal-badge.work { background: var(--color-success); color: white; }
    .cal-badge.rest { color: var(--color-text-secondary); }

    .actions-bar {
      display: flex; justify-content: space-between; align-items: center;
      background: var(--color-bg-card); padding: 14px 20px; border-radius: var(--radius-md);
      border: 1px solid var(--color-border); box-shadow: var(--shadow-sm);
    }
  </style>
</head>
<body>

  <!-- 顶栏 -->
  <div class="topbar">
    <div class="topbar-left">
      <img src="../extension/icons/icon128.png" alt="logo" />
      <h1>ONES 工时填写面板</h1>
      <span class="tag tag-success" style="padding: 2px 8px; border-radius: 12px; background: #E8FFEA; color: #00B42A; font-size: 12px; font-weight: 600;">● 已登录账户: duyin (ONES 效能中心)</span>
    </div>
    <div class="right">
      <div class="month-picker">
        <button>&lt;</button>
        <input type="month" value="2026-08" />
        <button>&gt;</button>
      </div>
      <button class="btn-secondary btn-sm" style="padding: 6px 12px;">刷新数据</button>
      <button class="btn-secondary btn-sm" style="padding: 6px 12px;">试运行 (Dry Run)</button>
    </div>
  </div>

  <!-- 步骤导航 -->
  <div class="steps">
    <div class="step done"><span class="step-num">✓</span> 1. 获取数据</div>
    <div class="step done"><span class="step-num">✓</span> 2. 规划工时</div>
    <div class="step active"><span class="step-num">3</span> 3. 预览分配</div>
    <div class="step"><span class="step-num">4</span> 4. 提交工时</div>
    <div class="step"><span class="step-num">5</span> 5. 状态流转</div>
    <div class="step"><span class="step-num">6</span> 6. 完成</div>
  </div>

  <!-- 月度容量摘要 -->
  <div class="summary">
    <div class="stat">
      <div class="label">应填工作日</div>
      <div class="value">22 天</div>
    </div>
    <div class="stat">
      <div class="label">应填总容量</div>
      <div class="value">176.0 h</div>
    </div>
    <div class="stat">
      <div class="label">当前已填工时</div>
      <div class="value">0.0 h</div>
    </div>
    <div class="stat">
      <div class="label">计划分配 / 缺口</div>
      <div class="value ok">176.0h (已填满)</div>
    </div>
  </div>

  <!-- 主内容双栏 -->
  <div class="dashboard-grid">
    
    <!-- 左栏：任务工时分配表 -->
    <div class="panel-card">
      <div class="panel-title">
        <span>📋 跨项目关联任务分配 (5 个任务)</span>
        <span style="font-size: 12px; color: var(--color-text-secondary);">共 176.0h</span>
      </div>
      <table class="task-table">
        <thead>
          <tr>
            <th>Key / 任务名称</th>
            <th style="text-align: right;">剩余</th>
            <th style="text-align: right;">分配工时</th>
            <th style="text-align: center;">流转动作</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="task-key">FE-1024</span> <span class="task-name">扩展 Manifest V3 重构</span></td>
            <td style="text-align: right; color: var(--color-text-secondary);">40h</td>
            <td style="text-align: right; font-weight: 700; color: var(--color-primary);">40.0h</td>
            <td style="text-align: center;"><span class="tag" style="background:#E8FFEA; color:#00B42A; padding:2px 6px; border-radius:4px; font-size:11px;">完成审核中</span></td>
          </tr>
          <tr>
            <td><span class="task-key">FE-1038</span> <span class="task-name">Edge 商店素材与全套图标绘制</span></td>
            <td style="text-align: right; color: var(--color-text-secondary);">32h</td>
            <td style="text-align: right; font-weight: 700; color: var(--color-primary);">32.0h</td>
            <td style="text-align: center;"><span class="tag" style="background:#E8F3FF; color:#165DFF; padding:2px 6px; border-radius:4px; font-size:11px;">进行中</span></td>
          </tr>
          <tr>
            <td><span class="task-key">QA-882</span> <span class="task-name">自动化测试与 Cookie 自动刷新</span></td>
            <td style="text-align: right; color: var(--color-text-secondary);">40h</td>
            <td style="text-align: right; font-weight: 700; color: var(--color-primary);">40.0h</td>
            <td style="text-align: center;"><span class="tag" style="background:#E8FFEA; color:#00B42A; padding:2px 6px; border-radius:4px; font-size:11px;">完成审核中</span></td>
          </tr>
          <tr>
            <td><span class="task-key">DOC-301</span> <span class="task-name">双语说明书与 PRIVACY.md 编写</span></td>
            <td style="text-align: right; color: var(--color-text-secondary);">24h</td>
            <td style="text-align: right; font-weight: 700; color: var(--color-primary);">24.0h</td>
            <td style="text-align: center;"><span class="tag" style="background:#E8F3FF; color:#165DFF; padding:2px 6px; border-radius:4px; font-size:11px;">进行中</span></td>
          </tr>
          <tr>
            <td><span class="task-key">BE-509</span> <span class="task-name">北森考勤数据解析接口对接</span></td>
            <td style="text-align: right; color: var(--color-text-secondary);">40h</td>
            <td style="text-align: right; font-weight: 700; color: var(--color-primary);">40.0h</td>
            <td style="text-align: center;"><span class="tag" style="background:#FFF7E8; color:#FF7D00; padding:2px 6px; border-radius:4px; font-size:11px;">已完成</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 右栏：工时日历分布图 -->
    <div class="panel-card">
      <div class="panel-title">
        <span>🗓️ 2026年8月 每日工时分布预览</span>
        <span style="font-size: 12px; color: var(--color-success); font-weight: 600;">● 考勤: 北森已关联</span>
      </div>
      <div class="calendar-grid">
        <div class="cal-header">一</div><div class="cal-header">二</div><div class="cal-header">三</div><div class="cal-header">四</div><div class="cal-header">五</div><div class="cal-header">六</div><div class="cal-header">日</div>
        
        <!-- Aug 2026 calendar cells (Starts on Sat Aug 1) -->
        <div class="cal-cell weekend"><span class="cal-date">1</span><span class="cal-badge rest">休</span></div>
        <div class="cal-cell weekend"><span class="cal-date">2</span><span class="cal-badge rest">休</span></div>
        
        <div class="cal-cell workday"><span class="cal-date">3</span><span class="cal-badge work">8h</span></div>
        <div class="cal-cell workday"><span class="cal-date">4</span><span class="cal-badge work">8h</span></div>
        <div class="cal-cell workday"><span class="cal-date">5</span><span class="cal-badge work">8h</span></div>
        <div class="cal-cell workday"><span class="cal-date">6</span><span class="cal-badge work">8h</span></div>
        <div class="cal-cell workday"><span class="cal-date">7</span><span class="cal-badge work">8h</span></div>
        <div class="cal-cell weekend"><span class="cal-date">8</span><span class="cal-badge rest">休</span></div>
        <div class="cal-cell weekend"><span class="cal-date">9</span><span class="cal-badge rest">休</span></div>

        <div class="cal-cell workday"><span class="cal-date">10</span><span class="cal-badge work">8h</span></div>
        <div class="cal-cell workday"><span class="cal-date">11</span><span class="cal-badge work">8h</span></div>
        <div class="cal-cell workday"><span class="cal-date">12</span><span class="cal-badge work">8h</span></div>
        <div class="cal-cell workday"><span class="cal-date">13</span><span class="cal-badge work">8h</span></div>
        <div class="cal-cell workday"><span class="cal-date">14</span><span class="cal-badge work">8h</span></div>
        <div class="cal-cell weekend"><span class="cal-date">15</span><span class="cal-badge rest">休</span></div>
        <div class="cal-cell weekend"><span class="cal-date">16</span><span class="cal-badge rest">休</span></div>

        <div class="cal-cell workday"><span class="cal-date">17</span><span class="cal-badge work">8h</span></div>
        <div class="cal-cell workday"><span class="cal-date">18</span><span class="cal-badge work">8h</span></div>
        <div class="cal-cell workday"><span class="cal-date">19</span><span class="cal-badge work">8h</span></div>
        <div class="cal-cell workday"><span class="cal-date">20</span><span class="cal-badge work">8h</span></div>
        <div class="cal-cell workday"><span class="cal-date">21</span><span class="cal-badge work">8h</span></div>
        <div class="cal-cell weekend"><span class="cal-date">22</span><span class="cal-badge rest">休</span></div>
        <div class="cal-cell weekend"><span class="cal-date">23</span><span class="cal-badge rest">休</span></div>

        <div class="cal-cell workday"><span class="cal-date">24</span><span class="cal-badge work">8h</span></div>
        <div class="cal-cell workday"><span class="cal-date">25</span><span class="cal-badge work">8h</span></div>
        <div class="cal-cell workday"><span class="cal-date">26</span><span class="cal-badge work">8h</span></div>
        <div class="cal-cell workday"><span class="cal-date">27</span><span class="cal-badge work">8h</span></div>
        <div class="cal-cell workday"><span class="cal-date">28</span><span class="cal-badge work">8h</span></div>
        <div class="cal-cell weekend"><span class="cal-date">29</span><span class="cal-badge rest">休</span></div>
        <div class="cal-cell weekend"><span class="cal-date">30</span><span class="cal-badge rest">休</span></div>
      </div>
    </div>

  </div>

  <!-- 底部操作栏 -->
  <div class="actions-bar">
    <button class="btn-secondary">← 上一步</button>
    <div style="font-size: 13px; color: var(--color-text-secondary);">
      💡 本地离线安全计算：确认无误后将通过 ONES 官方 GraphQL 提交工时
    </div>
    <button class="btn-primary" style="padding: 10px 24px; font-weight: 600;">确认分配并提交工时 ➔</button>
  </div>

</body>
</html>
"""

with open(HTML_PATH, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"Written html: {HTML_PATH}")

edge_path = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
cmd = [
    edge_path,
    '--headless=new',
    '--screenshot=' + OUT_PNG,
    '--window-size=1280,800',
    '--hide-scrollbars',
    'file:///' + HTML_PATH.replace('\\', '/')
]

print("Capturing headless Edge screenshot of real page layout...")
res = subprocess.run(cmd, capture_output=True, text=True)
print("Return code:", res.returncode)
print("Saved real page screenshot:", OUT_PNG, "Size:", os.path.getsize(OUT_PNG) if os.path.exists(OUT_PNG) else 0)
