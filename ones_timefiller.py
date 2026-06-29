#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ONES 工时自动填写工具（无需第三方依赖）"""

import sys, io
if sys.stdout.encoding and sys.stdout.encoding.upper() not in ("UTF-8", "UTF8"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
    sys.stdin  = io.TextIOWrapper(sys.stdin.buffer,  encoding="utf-8", errors="replace")

import json
import datetime
import calendar
import sys
import re
import argparse
import ssl
import time
import urllib.request
import urllib.error
from pathlib import Path

CONFIG_FILE  = Path(__file__).parent / "config.json"
BASE_URL     = "https://ones.reachauto.com/project/api/project"   # GraphQL 用
OQL_BASE     = "https://ones.reachauto.com/project/api/ones-project"  # OQL 用
GRAPHQL_PATH = "/team/{team}/items/graphql"

# 忽略 SSL 证书验证（企业内网常见情况）
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode    = ssl.CERT_NONE


# ─── 配置加载 ────────────────────────────────────────────────────────────────

def _jwt_exp(token):
    """从 JWT 中解析过期时间戳，解析失败返回 0"""
    try:
        import base64
        payload = token.split(".")[1]
        padded  = payload + "=" * (4 - len(payload) % 4)
        data    = json.loads(base64.urlsafe_b64decode(padded))
        return data.get("exp", 0)
    except Exception:
        return 0


def _try_refresh_token(cfg):
    """
    用 ones-ids-sid session cookie 换取新的 ones-lt access token。
    成功则更新 cfg["auth_token"] 并写回 config.json，返回 True。
    """
    sid = cfg.get("session_id", "")
    if not sid:
        return False

    refresh_urls = [
        "https://ones.reachauto.com/project/api/auth/token/refresh",
        "https://ones.reachauto.com/project/api/auth/sso/token",
        "https://ones.reachauto.com/ones/project/api/auth/token",
    ]
    hdrs = {
        "Cookie":       f"ones-ids-sid={sid}; ones-org-uuid={cfg.get('org_uuid','6ZKXo9yg')}",
        "Content-Type": "application/json",
        "Origin":       "https://ones.reachauto.com",
        "Referer":      "https://ones.reachauto.com/project/",
    }

    for url in refresh_urls:
        req = urllib.request.Request(url, method="GET", headers=hdrs)
        try:
            with urllib.request.urlopen(req, context=_SSL_CTX, timeout=10) as r:
                data = json.loads(r.read().decode())
                new_token = (data.get("data") or data).get("ones-lt") or data.get("access_token")
                if new_token:
                    cfg["auth_token"] = new_token
                    # 同步写回 config.json
                    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                        raw = json.load(f)
                    raw["auth_token"] = new_token
                    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                        json.dump(raw, f, ensure_ascii=False, indent=2)
                    return True
        except Exception:
            continue
    return False


def load_config():
    if not CONFIG_FILE.exists():
        print("错误: 找不到 config.json")
        print("\n请创建 config.json，内容如下（从浏览器 Cookie 里复制值）:")
        print(json.dumps({
            "user_id":    "ones-uid 的值（JWT 里的 org_user_uuid）",
            "auth_token": "ones-lt cookie 的值",
            "team_uuid":  "SpBJdKsD",
            "session_id": "ones-ids-sid cookie 的值（用于自动刷新 token）",
            "workflow":            ["未开始", "进行中", "完成审核中", "已完成"],
            "transition_comment":  "已经完成啦",
        }, ensure_ascii=False, indent=2))
        print("\n获取方法: 浏览器 F12 → Application → Cookies → ones.reachauto.com")
        sys.exit(1)

    with open(CONFIG_FILE, encoding="utf-8") as f:
        cfg = json.load(f)
    if "cookie_string" in cfg:
        uid, lt = _parse_cookie(cfg["cookie_string"])
        if uid and lt:
            cfg["user_id"]    = uid
            cfg["auth_token"] = lt

    # 检查 token 是否过期
    exp = _jwt_exp(cfg.get("auth_token", ""))
    now = int(datetime.datetime.now().timestamp())
    if exp and exp < now:
        mins_ago = (now - exp) // 60
        print(f"\n⚠  Token 已过期（{mins_ago} 分钟前），尝试自动刷新...")
        if _try_refresh_token(cfg):
            print("  ✓ Token 刷新成功，继续运行")
        else:
            print("  ✗ 自动刷新失败\n")
            print("  请这样更新 token（约1分钟）：")
            print("  1. 浏览器访问 ones.reachauto.com（保持登录状态）")
            print("  2. F12 → Application → Cookies → ones.reachauto.com")
            print("  3. 找到 ones-lt，复制它的 Value")
            print("  4. 粘贴到下面 ↓\n")
            new_token = input("  粘贴新 token（直接回车跳过）: ").strip()
            if new_token and len(new_token) > 50:
                cfg["auth_token"] = new_token
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                raw["auth_token"] = new_token
                with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                    json.dump(raw, f, ensure_ascii=False, indent=2)
                print("  ✓ Token 已更新\n")
            else:
                print("  跳过，继续运行（部分功能可能失败）\n")

    return cfg


def _parse_cookie(s):
    uid = re.search(r"ones-uid=([^;]+)", s)
    lt  = re.search(r"ones-lt=([^;]+)",  s)
    return (uid.group(1).strip() if uid else None,
            lt.group(1).strip()  if lt  else None)


# ─── HTTP 封装（纯 urllib）──────────────────────────────────────────────────

def _build_cookie(cfg):
    """组装 Cookie 字符串（浏览器发送的完整 cookie）"""
    token = cfg["auth_token"]
    sid   = cfg.get("session_id", "")
    parts = [f"ones-lt={token}"]
    if sid:
        parts.append(f"ones-ids-sid={sid}")
    parts += ["ones-lang=zh", "ones-region-uuid=default",
              f"ones-org-uuid={cfg.get('org_uuid','6ZKXo9yg')}"]
    return "; ".join(parts)


def _request(cfg, method, url, body=None, debug=False):
    """直接传完整 URL（不再拼 BASE_URL）"""
    data = json.dumps(body).encode() if body else None
    req  = urllib.request.Request(
        url, data=data, method=method,
        headers={
            "Authorization": f"Bearer {cfg['auth_token']}",
            "Ones-User-Id":  cfg["user_id"],
            "Cookie":        _build_cookie(cfg),
            "Content-Type":  "application/json;charset=UTF-8",
            "Origin":        "https://ones.reachauto.com",
            "Referer":       "https://ones.reachauto.com/project/",
        }
    )
    if debug:
        print(f"  [{method}] {url}")
        if body:
            print(f"  [Body] {json.dumps(body, ensure_ascii=False)[:400]}")
    try:
        with urllib.request.urlopen(req, context=_SSL_CTX, timeout=30) as resp:
            raw  = resp.read().decode()
            code = resp.status
            if debug:
                print(f"  [状态] {code}  [响应] {raw[:500]}")
            return code, json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        if debug:
            print(f"  [状态] {e.code}  [响应] {raw[:500]}")
        return e.code, {}
    except Exception as e:
        if debug:
            print(f"  [异常] {e}")
        return 0, {}


def _graphql(cfg, team_uuid, query, variables=None, tag="", debug=False):
    """发送 GraphQL 请求到 ONES Items API"""
    url  = f"{BASE_URL}{GRAPHQL_PATH.format(team=team_uuid)}"
    if tag:
        url += f"?t={tag}"
    body = {"query": query}
    if variables:
        body["variables"] = variables
    return _request(cfg, "POST", url, body, debug=debug)


def _get(cfg, path, debug=False):
    return _request(cfg, "GET", f"{BASE_URL}{path}", debug=debug)


def _post(cfg, path, body, debug=False):
    return _request(cfg, "POST", f"{BASE_URL}{path}", body, debug=debug)


# ─── 节假日数据 ───────────────────────────────────────────────────────────────
# off: 法定假日中的平日（需要休息）
# on:  补班日（周末需要上班）
# 2025 数据来自国务院官方通知；2026 为估算，可在 config.json extra_holidays 中覆盖

_HOLIDAYS = {
    2025: {
        "off": {
            "2025-01-01",                                              # 元旦
            "2025-01-28","2025-01-29","2025-01-30","2025-01-31",
            "2025-02-01","2025-02-02","2025-02-03","2025-02-04",       # 春节
            "2025-04-04","2025-04-05","2025-04-06",                    # 清明
            "2025-05-01","2025-05-02","2025-05-03","2025-05-04","2025-05-05",  # 劳动节
            "2025-06-02",                                              # 端午补休(周一)
            "2025-10-01","2025-10-02","2025-10-03","2025-10-04",
            "2025-10-05","2025-10-06","2025-10-07","2025-10-08",       # 国庆+中秋
        },
        "on": {
            "2025-01-26",   # 周日 春节前补班
            "2025-02-08",   # 周六 春节后补班
            "2025-04-27",   # 周日 劳动节前补班
            "2025-09-28",   # 周日 国庆前补班
            "2025-10-11",   # 周六 国庆后补班
        },
    },
    2026: {
        "off": [
        "2026-01-01",
        "2026-01-02",
        "2026-02-16",
        "2026-02-17",
        "2026-02-18",
        "2026-02-19",
        "2026-02-20",
        "2026-02-23",
        "2026-04-06",
        "2026-05-01",
        "2026-05-04",
        "2026-05-05",
        "2026-06-19",
        "2026-09-25",
        "2026-10-01",
        "2026-10-02",
        "2026-10-05",
        "2026-10-06",
        "2026-10-07"
        ],
        "on": [
        "2026-01-04",
        "2026-02-14",
        "2026-02-28",
        "2026-05-09",
        "2026-09-20",
        "2026-10-10"
        ]
    }
}


def _holiday_sets(year, cfg):
    """合并内置节假日 + config.json 中的自定义节假日，返回 (off_set, on_set)"""
    base = _HOLIDAYS.get(year, {"off": set(), "on": set()})
    off  = set(base["off"])
    on   = set(base["on"])

    extra = cfg.get("extra_holidays", {}) if cfg else {}
    for d in extra.get("off", []):
        off.add(d)
    for d in extra.get("on", []):
        on.add(d)
    # config 中也可以移除某个日期
    for d in extra.get("remove_off", []):
        off.discard(d)
    for d in extra.get("remove_on", []):
        on.discard(d)

    return off, on


# ─── GraphQL 辅助 ────────────────────────────────────────────────────────────

def _gql(cfg, team_uuid, query, tag="", debug=False):
    url = f"{BASE_URL}{GRAPHQL_PATH.format(team=team_uuid)}"
    if tag:
        url += f"?t={tag}"
    code, data = _request(cfg, "POST", url, {"query": query}, debug=debug)
    if code == 200 and "data" in data:
        return data["data"]
    if debug and code != 200:
        print(f"  [GraphQL 失败] code={code}")
    return None


# ─── 获取任务（跨项目） ───────────────────────────────────────────────────────

# 状态分类中文名
_CAT_CN = {"to_do": "未开始", "in_progress": "进行中", "done": "已完成"}


def _fetch_issue_types(cfg, team_uuid, tasks, debug=False):
    """
    GraphQL 查询补全 tasks 的 _issue_type 字段（工作项类型显示名称）。
    alternativeIssueType.name 是 ONES 中的显示名，issueType 本身不含 name。
    """
    if not tasks:
        return
    uuid_set = {t["uuid"] for t in tasks if t.get("uuid")}
    uuid_map = {t["uuid"]: t for t in tasks}
    q = ('{ tasks(filter:{assign:{uuid_in:["%s"]}},limit:200)'
         '{ uuid alternativeIssueType { name } } }') % cfg["user_id"]
    gdata = _gql(cfg, team_uuid, q, debug=debug)
    for t in (gdata or {}).get("tasks") or []:
        uuid = t.get("uuid", "")
        if uuid in uuid_set:
            itype = (t.get("alternativeIssueType") or {}).get("name", "")
            uuid_map[uuid]["_issue_type"] = itype


def fetch_tasks(cfg, team_uuid, debug=False):
    """
    OQL 查询：我负责的、未完成（to_do + in_progress）任务。
    field005 = 当前状态（uuid/name/category），field020 = 剩余预计工时。
    """
    if debug:
        print("\n[DEBUG] OQL 查询我负责的未完成任务...")

    # field027=计划开始, field028=计划结束, field019=已填工时总量, field020=剩余预计
    oql = (
        "select uid(uuid,field001,field006.uuid,field006.name,"
        "field005.uuid,field005.name,field005.category,"
        "toDate(field027),toDate(field028),field019,field020) "
        "from issue "
        "where uid(field017) IN (uid('to_do'), uid('in_progress')) "
        "AND uid(field004) IN (currentUser()) "
        "order by field009 desc "
        "limit 0, 200"
    )
    url  = f"{OQL_BASE}/team/{team_uuid}/workitems/onesql"
    code, data = _request(cfg, "POST", url, {"query": oql}, debug=debug)

    if code == 200 and isinstance(data.get("data"), list):
        tasks = []
        for row in data["data"]:
            item      = row.get("item", {})
            uuid      = item.get("uuid", "")
            name      = item.get("field001", "未命名")
            proj      = item.get("field006") or {}
            pname     = proj.get("name", "")
            status    = item.get("field005") or {}
            cat       = status.get("category", "")
            sname     = status.get("name", _CAT_CN.get(cat, cat))
            suuid     = status.get("uuid", "")
            remaining   = (item.get("field020") or 0) / 100000.0
            actual      = (item.get("field019") or 0) / 100000.0  # 总已填（跨月）
            estimated   = round(actual + remaining, 1)
            # 日期字段：toDate() 返回 "YYYY-MM-DD" 字符串或 None
            plan_start  = item.get("field027") or ""
            plan_end    = item.get("field028") or ""
            tasks.append({
                "uuid":          uuid,
                "summary":       name,
                "_proj":         pname,
                "_display":      f"[{pname}] {name}" if pname else name,
                "_done":         False,
                "_remaining":    remaining,
                "_estimated":    estimated,
                "_actual":       actual,
                "_plan_start":   plan_start,
                "_plan_end":     plan_end,
                "_category":     cat,
                "_status_name":  sname,
                "_status_uuid":  suuid,
                "_issue_type":   "",
            })
        # OQL 不支持 issueType，批量用 GraphQL 补全
        _fetch_issue_types(cfg, team_uuid, tasks, debug=debug)
        return tasks

    # fallback: GraphQL
    if debug:
        print(f"  OQL 失败({code})，降级到 GraphQL...")
    q = '{ tasks(filter:{assign:{uuid_in:["%s"]}}, limit:50) { uuid summary project { uuid name } } }' % cfg["user_id"]
    gdata = _gql(cfg, team_uuid, q, debug=debug)
    if gdata and gdata.get("tasks"):
        tasks = []
        for t in gdata["tasks"]:
            pname = (t.get("project") or {}).get("name", "")
            t["_proj"]        = pname
            t["_display"]     = f"[{pname}] {t['summary']}" if pname else t["summary"]
            t["_done"]        = False
            t["_category"]    = ""
            t["_status_name"] = ""
            t["_status_uuid"] = ""
            tasks.append(t)
        return tasks

    return []


# ─── 工作日（含节假日） ───────────────────────────────────────────────────────

def working_days(year, month, cfg=None):
    """
    返回指定月份的实际工作日列表：
      - 排除周六、周日
      - 排除法定假日（含自定义）
      - 加入补班日（周末上班）
    """
    off, on = _holiday_sets(year, cfg)

    days = []
    for day in range(1, calendar.monthrange(year, month)[1] + 1):
        d    = datetime.date(year, month, day)
        ds   = d.isoformat()
        is_weekend = d.weekday() >= 5
        if ds in on:              # 补班：不管是否周末，都上班
            days.append(d)
        elif is_weekend:          # 普通周末：不上班
            continue
        elif ds in off:           # 法定假日：不上班
            continue
        else:
            days.append(d)
    return days


# ─── 查询已填工时（GraphQL） ──────────────────────────────────────────────────

def fetch_filled_hours(cfg, team_uuid, year, month, debug=False):
    """
    用 GraphQL manhours 查询当月已填工时。
    返回 {date: hours} 或 None（查询失败）。
    hours 单位：ONES 内部是 actual_hours * 100000，这里转换为小时浮点数。
    """
    uid   = cfg.get("user_id", "")
    first = int(datetime.datetime(year, month, 1, 0, 0).timestamp())
    last  = int(datetime.datetime(year, month,
                                  calendar.monthrange(year, month)[1],
                                  23, 59, 59).timestamp())

    # ONES GraphQL 不支持 startTime 范围过滤，取最近 500 条后 Python 端按月过滤
    q = '''
{ manhours(
    filter:{ owner:{uuid_in:["%s"]} }
    orderBy:{ startTime:DESC }
    limit:500
  ) { uuid startTime hours type task { uuid } } }
''' % uid

    data = _gql(cfg, team_uuid, q, debug=debug)
    if data is None:
        return None

    by_date = {}   # {date: hours}
    by_task = {}   # {task_uuid: hours}  ← 本月每个任务已填
    for mh in data.get("manhours", []):
        if mh.get("type") != "recorded":
            continue
        ts = mh.get("startTime", 0)
        if not ts:
            continue
        d = datetime.date.fromtimestamp(ts)
        if d.year != year or d.month != month:
            continue
        h = mh.get("hours", 0) / 100000.0
        by_date[d] = by_date.get(d, 0.0) + h
        tuuid = (mh.get("task") or {}).get("uuid", "")
        if tuuid:
            by_task[tuuid] = by_task.get(tuuid, 0.0) + h

    # 把 by_task 挂在 by_date 上一起返回（调用方用 .get("_by_task")）
    by_date["_by_task"] = by_task
    return by_date


# ─── 交互输入 ────────────────────────────────────────────────────────────────

def input_hours(tasks, task_filled=None, capacity=0, total_filled=0, label=""):
    """
    task_filled : {task_uuid: hours}  本月各任务已填
    capacity    : 月度总容量（小时）
    total_filled: 本月已填总工时
    每个任务默认值 = min(任务剩余预计工时, 月度剩余缺口)
    """
    tf            = task_filled or {}
    month_remain  = max(0.0, capacity - total_filled)  # 月度还差多少

    # ── 先列出所有任务 ──────────────────────────────────────────
    # 列宽常量
    PW, NW = 16, 26   # 项目名、任务名
    print("\n" + "─" * 80)
    hdr = f"  {'#':>3}  {_ljust('项目',PW)}  {_ljust('任务',NW)}  {_ljust('状态',8)}  {_rjust('剩余预计',6)}  {_rjust('本月已填',6)}"
    print(hdr)
    print("─" * 80)
    for i, t in enumerate(tasks):
        pname    = (t.get("_proj") or "")[:PW]
        tname    = (t.get("summary") or "")[:NW]
        sname    = (t.get("_status_name") or "")[:8]
        task_rem = t.get("_remaining", 0.0)
        filed    = tf.get(t.get("uuid", ""), 0.0)
        rem_s    = f"{task_rem:.0f}h" if task_rem > 0 else "—"
        fil_s    = f"{filed:.1f}h"    if filed    > 0 else "—"
        print(f"  [{i+1:2d}]  {_ljust(pname,PW)}  {_ljust(tname,NW)}  {_ljust(sname,8)}  {_rjust(rem_s,6)}  {_rjust(fil_s,6)}")
    print("─" * 80)
    _lbl = f"{label}工时" if label else "工时"
    avail_s = f"{month_remain:.1f}h" if month_remain > 0 else "已满"
    print(f"  {'可追加' if label else '月度剩余'}: {avail_s}  |  回车 = 任务剩余预计（不超上限）\n")

    # ── 逐一输入 ────────────────────────────────────────────────
    result = {}
    for i, t in enumerate(tasks):
        name     = t.get("_display") or t.get("summary", "未命名任务")
        uuid     = t.get("uuid", "")
        filed    = tf.get(uuid, 0.0)
        task_rem = t.get("_remaining", 0.0)

        # 有预计剩余工时 → 取 min(任务剩余, 月度缺口)
        # 无预计 → 默认 0（让用户自己填）
        if task_rem > 0:
            default = round(min(task_rem, month_remain), 1)
        else:
            default = 0.0

        sname = t.get("_status_name", "")
        print(f"\n[{i+1}/{len(tasks)}] {_fmt_task(t)}  [{sname}]")
        if filed > 0:
            print(f"  本月已填: {filed:.1f}h", end="")
        if task_rem > 0:
            print(f"  任务剩余预计: {task_rem:.1f}h", end="")
        if filed > 0 or task_rem > 0:
            print()

        while True:
            try:
                lbl_str = f"{label}工时" if label else "工时"
                prompt = f"  {lbl_str}(小时) [回车={default}h，0=跳过]: "
                raw    = input(prompt).strip()
                if not raw:
                    h = default
                else:
                    h = float(raw)
                h = max(0.0, min(h, month_remain))  # 不超月度缺口
                if h > 0:
                    result[uuid]  = {"name": name, "uuid": uuid, "hours": h}
                    month_remain  = max(0.0, month_remain - h)
                break
            except ValueError:
                print("  请输入数字，如 8 或 2.5")

        if month_remain <= 0:
            remaining_tasks = tasks[i+1:]
            if remaining_tasks:
                print(f"\n  月度容量已填满，剩余 {len(remaining_tasks)} 个任务跳过")
            break

    return result


def input_manual_tasks():
    print("\n" + "=" * 65)
    print("手动输入任务（任务名为空时结束）")
    print("=" * 65)
    result = {}
    idx = 1
    while True:
        name = input(f"\n任务{idx} 名称（回车结束）: ").strip()
        if not name:
            break
        while True:
            try:
                raw = input(f"  工时(小时): ").strip()
                if not raw:
                    break
                h = float(raw)
                if h > 0:
                    key = f"manual_{idx}"
                    result[key] = {"name": name, "uuid": key, "hours": h}
                break
            except ValueError:
                print("  请输入数字")
        idx += 1
    return result


def _task_filled(filled_hours):
    """从 filled_hours 取出 by_task 字典，不影响日期迭代"""
    return filled_hours.get("_by_task", {}) if isinstance(filled_hours, dict) else {}


# ─── 工时分配 ────────────────────────────────────────────────────────────────

def distribute(task_hours, wdays, filled_hours, daily_limit=8.0):
    """
    daily_limit: 每天可填上限（正常=8h，加班模式=8+overtime_max）
    """
    remaining = {}
    for d in wdays:
        avail = daily_limit - filled_hours.get(d, 0.0)
        if avail > 0.001:
            remaining[d] = avail

    open_days = sorted(remaining.keys())
    entries   = []
    day_idx   = 0

    for uuid, info in task_hours.items():
        left = info["hours"]
        while left > 0.001:
            if day_idx >= len(open_days):
                print(f"  ! 任务 '{info['name'][:30]}' 剩余 {left:.1f}h 无法分配（工作日不足）")
                break
            d    = open_days[day_idx]
            fill = min(left, remaining[d])
            remaining[d] -= fill
            left         -= fill
            entries.append({
                "task_uuid":  uuid,
                "task_name":  info["name"],
                "date":       d,
                "hours":      round(fill, 2),
                "is_overtime": info.get("is_overtime", False),
            })
            if remaining[d] < 0.001:
                day_idx += 1

    return entries, remaining


# ─── 评论 HTML 构造 ──────────────────────────────────────────────────────────

def _make_comment_html(text):
    """
    构建 ONES 评论字段所需的 HTML 值。
    格式参考浏览器实际请求：ones-editor-doc JSON base64 + ones-editor-text base64。
    """
    import base64, random, string
    block_id = "".join(random.choices(string.ascii_letters + string.digits, k=8))
    doc = {
        "blocks": {"root": [{"id": block_id, "type": "text", "text": [{"insert": text}]}]},
        "meta": {},
        "comments": {},
    }
    doc_b64  = base64.b64encode(json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
                                .encode("utf-8")).decode("ascii")
    text_b64 = base64.b64encode(text.encode("utf-8")).decode("ascii")
    return (
        f'<!doctype html><html><head><meta charset="utf-8">'
        f'<ones-editor-doc data-source="ones-editor-doc::{doc_b64}::ones-editor-doc">'
        f'</ones-editor-doc>'
        f'<meta name="ones-editor-text" content="{text_b64}" />'
        f'</head><body><p>    </p></body></html>'
    )


# ─── 工作流配置解析 ──────────────────────────────────────────────────────────

def _parse_workflow(cfg):
    """
    从 config.json 的 workflow 字段解析状态流转配置。

    workflow 格式（按工作项类型分组的对象）：
      {
        "任务": [
          {"status": "未开始", "button": "开始任务"},
          {"status": "进行中", "button": "完成任务"},
          {"status": "已完成"}
        ],
        "工作任务": [
          {"status": "未开始",     "button": "开始任务"},
          {"status": "进行中",     "button": "完成审核中", "comment": "已经完成啦"},
          {"status": "完成审核中", "button": "已完成"},
          {"status": "已完成"}
        ]
      }
      - key    : 工作项类型名（与 ONES 中显示的一致）
      - status : 任务当前状态名，用于过滤目标任务
      - button : ONES 流转按钮名，用于从 transitions 中精确匹配
      - comment: 可选，执行该流转时附加的评论

    返回 {类型名: [step_dict, ...]}，每个 step_dict：
      {"from_status": str, "to_status": str, "button": str, "comment": str}
    """
    default_raw = {
        "任务": [
            {"status": "未开始", "button": "开始任务"},
            {"status": "进行中", "button": "完成任务"},
            {"status": "已完成"},
        ],
        "工作任务": [
            {"status": "未开始",     "button": "开始任务"},
            {"status": "进行中",     "button": "完成审核中", "comment": "已经完成啦"},
            {"status": "完成审核中", "button": "已完成"},
            {"status": "已完成"},
        ],
    }
    raw = cfg.get("workflow")
    if not isinstance(raw, dict):
        raw = default_raw

    global_comment = cfg.get("transition_comment", "")
    result = {}
    for type_name, raw_steps in raw.items():
        if not isinstance(raw_steps, list) or len(raw_steps) < 2:
            continue
        steps = []
        for i in range(len(raw_steps) - 1):
            cur = raw_steps[i]
            nxt = raw_steps[i + 1]
            if not isinstance(cur, dict) or not isinstance(nxt, dict):
                continue
            button = cur.get("button", "")
            if not button:
                continue
            steps.append({
                "from_status": cur.get("status", ""),
                "to_status":   nxt.get("status", ""),
                "button":      button,
                "comment":     cur.get("comment", global_comment),
            })
        if steps:
            result[type_name] = steps
    return result


def _find_step(cfg, task):
    """
    根据任务的工作项类型和当前状态名，从 workflow 配置中找到匹配的流转步骤。
    先按类型精确匹配，找不到则用第一个定义的类型作为兜底。
    返回 step_dict 或 None。
    """
    wf = _parse_workflow(cfg)
    if not wf:
        return None
    issue_type  = task.get("_issue_type", "")
    status_name = task.get("_status_name", "")
    steps = wf.get(issue_type) or next(iter(wf.values()))
    for step in steps:
        if step["from_status"] and step["from_status"] in status_name:
            return step
    return None


def _is_last_step(cfg, task):
    """
    判断当前任务的流转步骤是否为该类型 workflow 的最后一步（即下一步就是终态）。
    工作项类型未知时返回 False，避免误判。
    """
    if not task.get("_issue_type"):
        return False
    wf = _parse_workflow(cfg)
    if not wf:
        return False
    issue_type = task.get("_issue_type", "")
    steps = wf.get(issue_type)
    if not steps:
        return False
    step = _find_step(cfg, task)
    return step is not None and step == steps[-1]


def _eligible_for_update(task, year, month, extra_submitted_hours=0):
    """
    三条过滤规则，阶段2和阶段3共用：
    1. 工时未填满（estimated > 0 且 actual + extra < estimated）→ False
    2. 计划结束时间超过本月末 → False
    3. 计划结束时间早于今天（已过期）→ False
    """
    today      = datetime.date.today()
    month_last = datetime.date(year, month, calendar.monthrange(year, month)[1])

    pe = (task.get("_plan_end") or "")[:10]
    if pe:
        try:
            end_date = datetime.date.fromisoformat(pe)
            if end_date > month_last:
                return False
            if end_date < today:
                return False
        except ValueError:
            pass

    est = task.get("_estimated", 0.0)
    if est > 0:
        act = task.get("_actual", 0.0) + extra_submitted_hours
        if act < est - 0.1:
            return False
    return True


# ─── 任务状态修改（通过 v2/transitions REST API）───────────────────────────────

_TRANSITIONS_CACHE = {}  # {task_uuid: [transition_dict]}


def _fetch_transitions(cfg, team_uuid, task_uuid, debug=False):
    """
    GET {OQL_BASE}/team/{team}/issue/{task_uuid}/v2/transitions
    返回该任务当前可用的流转列表（含 uuid、name、end_status_uuid）。
    """
    if task_uuid in _TRANSITIONS_CACHE:
        return _TRANSITIONS_CACHE[task_uuid]
    url = f"{OQL_BASE}/team/{team_uuid}/issue/{task_uuid}/v2/transitions"
    code, data = _request(cfg, "GET", url, debug=debug)
    transitions = []
    if code == 200:
        if isinstance(data, list):
            transitions = data
        elif isinstance(data.get("transitions"), list):
            transitions = data["transitions"]
        elif isinstance(data.get("data"), list):
            transitions = data["data"]
    _TRANSITIONS_CACHE[task_uuid] = transitions
    return transitions


def _pick_transition(transitions, button_hint="", to_category="",
                     known_statuses=None, last=False):
    """
    从可用流转中挑选目标流转：
    1. 按 button_hint 精确匹配流转按钮名（transition.name）
    2. 按 to_category 匹配目标状态分类（需要 known_statuses 映射）
    都匹配不上则返回 None（不猜测，由调用方跳过该任务）。
    """
    if not transitions:
        return None
    known_cat = known_statuses or {}

    if button_hint:
        matches = [tr for tr in transitions if button_hint in (tr.get("name") or "")]
        if matches:
            return matches[-1] if last else matches[0]

    if to_category:
        matches = [tr for tr in transitions
                   if known_cat.get(tr.get("end_status_uuid", "")) == to_category]
        if matches:
            return matches[-1] if last else matches[0]

    return None


def _execute_transition(cfg, team_uuid, task_uuid, transition_uuid, comment="", debug=False):
    """
    POST {BASE_URL}/team/{team}/task/{task_uuid}/new_transit
    body: {"transition_uuid": "...", "field_values": [...]}
    执行状态流转，返回 (ok, error_reason)。
    comment 不为空时写入 field057（评论字段，required=false）。
    """
    url = f"{BASE_URL}/team/{team_uuid}/task/{task_uuid}/new_transit"
    field_values = []
    if comment:
        field_values = [{"field_uuid": "field057", "value": _make_comment_html(comment)}]
    body = {"transition_uuid": transition_uuid, "field_values": field_values}
    code, data = _request(cfg, "POST", url, body, debug=debug)
    if code in (200, 204):
        errs = data.get("errors") if isinstance(data, dict) else None
        if not errs:
            return True, ""
        return False, str((errs[0] or {}).get("message", errs[0]))[:80]
    reason = ""
    if isinstance(data, dict):
        reason = data.get("desc") or data.get("errcode") or f"HTTP {code}"
    else:
        reason = f"HTTP {code}"
    return False, str(reason)[:80]


def batch_status_update(cfg, team_uuid, tasks, from_category, to_category,
                        prompt_label="", debug=False):
    """
    批量询问并更新一组任务的状态（通过 v2/transitions REST API）。
    每个任务根据其工作项类型和当前状态名，从 workflow 配置中找到对应的流转按钮。
    返回实际更新的任务列表。
    """
    # 只处理分类匹配、且 workflow 中有对应步骤的任务
    targets = [t for t in tasks
               if t.get("_category") == from_category
               and _find_step(cfg, t) is not None]
    if not targets:
        return []

    _cn = _CAT_CN.get
    label = prompt_label or f"{_cn(from_category, from_category)} → {_cn(to_category, to_category)}"
    print(f"\n有 {len(targets)} 个任务可更新状态（{label}）：")
    PW, NW = 16, 22
    print(f"  {_ljust('项目',PW)}  {_ljust('任务',NW)}  {_ljust('状态',8)}  {_ljust('类型',8)}  "
          f"{_rjust('计划开始',10)}  {_rjust('计划结束',10)}  {_rjust('已填/预估',10)}")
    print(f"  {'─'*PW}  {'─'*NW}  {'─'*8}  {'─'*8}  {'─'*10}  {'─'*10}  {'─'*10}")
    for t in targets:
        pname  = (t.get("_proj") or "")[:PW]
        tname  = (t.get("summary") or "")[:NW]
        sname  = (t.get("_status_name") or "")[:8]
        itype  = (t.get("_issue_type") or "")[:8]
        ps     = (t.get("_plan_start") or "")[:10] or "—"
        pe     = (t.get("_plan_end")   or "")[:10] or "—"
        actual = t.get("_actual", 0.0)
        est    = t.get("_estimated", 0.0)
        hours  = f"{actual:.0f}h/{est:.0f}h" if est > 0 else f"{actual:.0f}h/—"
        step   = _find_step(cfg, t)
        arrow  = f"→ {step['to_status']}" if step else ""
        print(f"  {_ljust(pname,PW)}  {_ljust(tname,NW)}  {_ljust(sname,8)}  {_ljust(itype,8)}  "
              f"{_rjust(ps,10)}  {_rjust(pe,10)}  {_rjust(hours,10)}  {arrow}")

    raw = input(f"确认更新？[Y/n]: ").strip().lower()
    if raw in ("n", "no"):
        print("  跳过状态更新")
        return []

    updated = []
    for t in targets:
        step = _find_step(cfg, t)
        if not step:
            continue
        transitions = _fetch_transitions(cfg, team_uuid, t["uuid"], debug=debug)
        if not transitions:
            print(f"  — {_fmt_task(t)[:48]}  （无可用流转，或 API 失败）")
            continue
        tr = _pick_transition(transitions, button_hint=step["button"])
        if not tr:
            print(f"  — {_fmt_task(t)[:48]}  （找不到按钮 '{step['button']}'）")
            continue
        ok, reason = _execute_transition(cfg, team_uuid, t["uuid"], tr["uuid"],
                                         comment=step["comment"], debug=debug)
        mark = "✓" if ok else "✗"
        tail = f"  ({reason})" if reason else ""
        print(f"  {mark} {_fmt_task(t)[:48]}  → {step['to_status']}{tail}")
        if ok:
            t["_category"]    = to_category
            t["_status_name"] = step["to_status"]
            updated.append(t)
    return updated


def _fmt_task(t, pwidth=18, nwidth=24):
    """固定宽度格式化：[项目名] 任务名"""
    pname = (t.get("_proj") or "")[:pwidth]
    name  = (t.get("summary") or t.get("_display") or "")[:nwidth]
    return f"[{pname:<{pwidth}}] {name:<{nwidth}}"


import unicodedata as _ud

def _wcswidth(s):
    """字符串显示宽度（CJK 全角字符计2）"""
    return sum(2 if _ud.east_asian_width(c) in ('W', 'F') else 1 for c in s)

def _ljust(s, w):
    return s + ' ' * max(0, w - _wcswidth(s))

def _rjust(s, w):
    return ' ' * max(0, w - _wcswidth(s)) + s


# ─── 打印计划 ────────────────────────────────────────────────────────────────

_WD = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


def print_filled_status(wdays, filled_hours, fetch_ok):
    if not fetch_ok:
        print("  （无法获取已填工时，将跳过重复检查）")


def print_plan(entries, filled_hours, wdays, new_planned, capacity, overtime_hours=0):
    """整月日历视图：每个工作日一行，显示已填/新增/空白状态"""
    # 按日期索引新增条目
    new_by_day = {}
    for e in entries:
        new_by_day.setdefault(e["date"], []).append(e)

    total_filled = sum(filled_hours.get(d, 0.0) for d in wdays)
    total_after  = total_filled + new_planned
    gap          = capacity - total_after

    print("\n" + "=" * 72)
    print(f"  {'日期':<12} {'星期':<4}  {'已填':>5}  {'新增':>5}  {'合计':>5}  {'状态'}")
    print("-" * 72)

    for d in wdays:
        already  = filled_hours.get(d, 0.0)
        new_ents = new_by_day.get(d, [])
        adding   = sum(e["hours"] for e in new_ents)
        total    = already + adding
        wd_str   = _WD[d.weekday()]

        if total >= 8.0 - 0.01:
            bar = "▓" * 8
        else:
            bar = "▓" * int(total) + "░" * (8 - int(total))

        if new_ents and already > 0.01:
            status = f"续填  {', '.join(e['task_name'][:18] for e in new_ents)}"
        elif new_ents:
            status = f"→ {', '.join(e['task_name'][:22] for e in new_ents)}"
        elif already >= 8.0 - 0.01:
            status = "✓ 已满"
        elif already > 0.01:
            status = f"已填{already:.0f}h 本次未补"
        else:
            status = "—"

        print(f"  {str(d):<12} {wd_str:<4}  {already:>4.1f}h  {adding:>4.1f}h  "
              f"{total:>4.1f}h  {bar}  {status}")

    normal_new = new_planned - overtime_hours
    print("=" * 72)
    if overtime_hours > 0:
        print(f"  已填: {total_filled:.1f}h   正常新增: {normal_new:.1f}h   加班: {overtime_hours:.1f}h   "
              f"提交后: {total_after:.1f}h / {capacity}h")
    else:
        print(f"  已填: {total_filled:.1f}h   本次新增: {new_planned:.1f}h   "
              f"提交后: {total_after:.1f}h / {capacity}h")
    if gap > 0.01:
        print(f"\n  ⚠  提交后仍不足，还差 {gap:.1f}h（约 {gap/8:.1f} 个工作日）")
    elif gap < -0.01:
        if overtime_hours > 0:
            print(f"\n  ✓  含加班 {overtime_hours:.1f}h，提交后合计 {total_after:.1f}h")
        else:
            print(f"\n  ✓  工时超出容量 {-gap:.1f}h（已截断）")
    else:
        print(f"\n  ✓  提交后恰好填满本月！")


# ─── 提交工时（GraphQL mutation） ────────────────────────────────────────────

_ADD_MANHOUR_QUERY = """
    mutation AddManhour {
      addManhour (mode: $mode owner: $owner task: $task type: $type
                  start_time: $start_time hours: $hours description: $description) {
        key
      }
    }
"""

def submit_entry(cfg, team_uuid, entry, debug=False):
    """
    用 addManhour mutation 写入工时。
    hours 单位: actual_hours * 100000（1h=100000, 8h=800000）
    start_time: 当天 09:00 的 Unix 时间戳
    """
    dt   = datetime.datetime.combine(entry["date"], datetime.time(9, 0))
    url  = f"{BASE_URL}{GRAPHQL_PATH.format(team=team_uuid)}?t=AddManhour"
    body = {
        "query": _ADD_MANHOUR_QUERY,
        "variables": {
            "mode":        "simple",
            "owner":       cfg["user_id"],
            "task":        entry["task_uuid"],
            "type":        "recorded",
            "start_time":  int(dt.timestamp()),
            "hours":       int(entry["hours"] * 100000),
            "description": "",
        }
    }
    code, data = _request(cfg, "POST", url, body, debug=debug)
    if code == 200:
        key = (data.get("data") or {}).get("addManhour", {}).get("key", "")
        if key:
            return True, key
        # 有 data 但结构不同——也算成功
        if "data" in data and "errors" not in data:
            return True, str(data.get("data"))[:40]
    return False, f"HTTP {code}: {str(data)[:100]}"


# ─── 主程序 ──────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description="ONES 工时自动填写工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""\
示例:
  python ones_timefiller.py              填写本月工时
  python ones_timefiller.py -m 2025-06   填写指定月份
  python ones_timefiller.py --dry-run    只预览，不提交
  python ones_timefiller.py --debug      显示 API 调试信息
  python ones_timefiller.py --manual     手动输入任务（不调 API）
""")
    ap.add_argument("-m", "--month",  help="月份 YYYY-MM，默认当月")
    ap.add_argument("--dry-run",      action="store_true", help="预览，不提交")
    ap.add_argument("--debug",        action="store_true", help="API 调试输出")
    ap.add_argument("--manual",       action="store_true", help="手动输入任务")
    ap.add_argument("--team",         help="Team UUID，覆盖配置")
    args = ap.parse_args()

    # 手动模式不需要 config.json（无需调 API）
    if args.manual:
        cfg = {"user_id": "", "auth_token": "", "team_uuid": args.team or "SpBJdKsD"}
    else:
        cfg = load_config()
    team_uuid = args.team or cfg.get("team_uuid", "SpBJdKsD")

    if args.month:
        year, month = map(int, args.month.split("-"))
    else:
        t = datetime.date.today()
        year, month = t.year, t.month

    print(f"\nONES 工时填写  |  {year}年{month}月")
    wdays    = working_days(year, month, cfg)
    capacity = len(wdays) * 8

    # 查询本月已填工时
    filled_hours = {}
    fetch_ok     = False
    if not args.manual:
        print("正在查询已填工时...", end="", flush=True)
        result = fetch_filled_hours(cfg, team_uuid, year, month, debug=args.debug)
        if result is None:
            print(" 查询失败（token 可能已过期）")
        else:
            filled_hours = result
            fetch_ok     = True
            total_f = sum(h for k, h in filled_hours.items() if k != "_by_task")
            print(f" 已填 {total_f:.1f}h")

    # ── 月度缺口摘要（最显眼的位置）─────────────────────────────
    total_filled = sum(h for k, h in filled_hours.items() if k != "_by_task")
    gap          = capacity - total_filled
    print(f"\n{'─'*50}")
    print(f"  {year}年{month}月  工作日 {len(wdays)} 天  |  月度容量 {capacity}h")
    print(f"  已填 {total_filled:.1f}h  |  还差 {max(gap,0):.1f}h  "
          f"({'约 ' + str(round(gap/8,1)) + ' 个工作日' if gap>0 else '已填满'})")
    print(f"{'─'*50}\n")

    # ── 获取任务 ────────────────────────────────────────────────
    tasks = []
    if args.manual:
        task_hours = input_manual_tasks()
    else:
        print("正在获取任务...", end="", flush=True)
        tasks = fetch_tasks(cfg, team_uuid, debug=args.debug)
        if not tasks:
            print(" 未找到（或认证失败）")
            print("提示: --debug 查看详情；--manual 手动输入")
            if input("切换手动模式？[y/N]: ").strip().lower() == "y":
                task_hours = input_manual_tasks()
            else:
                sys.exit(0)
        else:
            print(f" {len(tasks)} 个")

            # ── 阶段1：未开始任务询问是否启动 ────────────────────
            if not args.dry_run:
                todo_tasks = [t for t in tasks if t.get("_category") == "to_do"]
                if todo_tasks:
                    batch_status_update(
                        cfg, team_uuid, todo_tasks,
                        from_category="to_do", to_category="in_progress",
                        prompt_label="未开始 → 进行中",
                        debug=args.debug,
                    )

            # ── 月度已满时跳过正常工时，直接进加班 ───────────────
            if total_filled >= capacity - 0.01:
                task_hours = {}
            else:
                task_hours = input_hours(
                    tasks,
                    task_filled=_task_filled(filled_hours),
                    capacity=capacity,
                    total_filled=total_filled,
                )

    overtime_daily   = cfg.get("overtime_daily_max", 4)
    task_hours       = task_hours or {}
    new_planned      = sum(v["hours"] for v in task_hours.values())
    entries          = []
    overtime_hours   = {}
    overtime_entries = []

    if new_planned > 0:
        entries, _ = distribute(task_hours, wdays, filled_hours)

    after_normal = total_filled + new_planned

    # ── 加班工时 ────────────────────────────────────────────────
    if after_normal >= capacity - 0.01:
        prefix = "\n月度容量已填满（{}h）".format(capacity) if new_planned > 0 else \
                 "\n月度容量已满（{}h），进入加班工时".format(capacity)
        print(prefix)
        ans = input(f"追加加班工时？每天最多再加 {overtime_daily}h [y/N]: ").strip().lower()
        if ans == "y":
            print(f"\n── 加班工时 ─────────────────────────────────────")
            print(f"叠加在每天 8h 之上，每天上限 {overtime_daily}h")
            overtime_hours = input_hours(
                tasks, task_filled=_task_filled(filled_hours),
                capacity=len(wdays) * overtime_daily, total_filled=0,
                label="加班",
            )
            if overtime_hours:
                for v in overtime_hours.values():
                    v["is_overtime"] = True
                overtime_entries, _ = distribute(
                    overtime_hours, wdays, filled_hours,
                    daily_limit=8.0 + overtime_daily,
                )

    api_entries = []
    ok_cnt      = 0

    if not task_hours and not overtime_hours:
        print("\n未输入工时，跳过提交")
    else:
        all_entries = entries + overtime_entries
        ot_planned  = sum(v["hours"] for v in overtime_hours.values())

        # ── 分配预览 ──────────────────────────────────────────────
        print_plan(all_entries, filled_hours, wdays,
                   new_planned + ot_planned, capacity,
                   overtime_hours=ot_planned)

        if args.dry_run:
            print("\n预览模式，不提交")
            return

        manual_keys = ({k for k in task_hours if k.startswith("manual_")} |
                       {k for k in overtime_hours if k.startswith("manual_")})
        api_entries = [e for e in all_entries if e["task_uuid"] not in manual_keys]

        if not api_entries:
            print("\n（手动任务不提交到 ONES，仅供本地规划）")
        else:
            # ── 确认提交（默认 yes）────────────────────────────────
            ot_note = f" + {ot_planned:.1f}h 加班" if ot_planned > 0 else ""
            print(f"\n共 {len(api_entries)} 条记录（{new_planned:.1f}h 正常{ot_note}）即将提交")
            if input("确认提交？[Y/n]: ").strip().lower() in ("n", "no"):
                print("已取消")
                api_entries = []
            else:
                # ── 提交工时 ──────────────────────────────────────
                print()
                fail_cnt = 0
                for e in api_entries:
                    ot_tag  = " [加班]" if e.get("is_overtime") else ""
                    success, msg = submit_entry(cfg, team_uuid, e, debug=args.debug)
                    mark = "✓" if success else "✗"
                    tail = f"  {msg}" if msg and not success else ""
                    print(f"  {mark} {e['date']}  {e['hours']:4.1f}h{ot_tag}  {e['task_name'][:40]}{tail}")
                    if success: ok_cnt += 1
                    else:       fail_cnt += 1
                print(f"\n提交完成：成功 {ok_cnt} 条，失败 {fail_cnt} 条")

    if args.manual:
        return

    # ── 阶段2：进行中任务（非最后一步）询问是否更新状态 ──────────────
    # 有提交工时时只针对刚提交的任务；没有提交工时时针对全部进行中任务
    submitted_by_task: dict = {}
    for e in api_entries:
        submitted_by_task[e["task_uuid"]] = submitted_by_task.get(e["task_uuid"], 0.0) + e["hours"]

    def _is_stage2_candidate(t):
        # 阶段2只处理"进行中"状态（不处理完成审核中等中间状态，那是阶段3的范畴）
        return ("进行中" in (t.get("_status_name") or "")
                and t.get("_category") == "in_progress"
                and _find_step(cfg, t) is not None
                and _eligible_for_update(t, year, month,
                                         submitted_by_task.get(t.get("uuid", ""), 0.0)))

    if api_entries and ok_cnt > 0:
        filled_uuids  = {e["task_uuid"] for e in api_entries}
        inprog_filled = [t for t in tasks
                         if _is_stage2_candidate(t) and t["uuid"] in filled_uuids]
    else:
        inprog_filled = [t for t in tasks if _is_stage2_candidate(t)]
    if inprog_filled:
        batch_status_update(
            cfg, team_uuid, inprog_filled,
            from_category="in_progress", to_category="in_progress",
            prompt_label="进行中 → 提交审核",
            debug=args.debug,
        )

    # ── 最终状态展示 ──────────────────────────────────────────────
    _print_final_status(cfg, team_uuid, year, month, wdays, capacity, tasks, args.debug,
                        new_entries=api_entries, initial_total=total_filled)


def _print_final_status(cfg, team_uuid, year, month, wdays, capacity, tasks, debug,
                        new_entries=None, initial_total=0):
    """刷新并展示当月工时状态，询问完成审核中 → 已完成"""
    print("\n正在刷新工时状态...", end="", flush=True)
    time.sleep(1)   # 等待服务器处理刚提交的工时
    result = fetch_filled_hours(cfg, team_uuid, year, month, debug=debug)
    if result is None:
        print(" 查询失败")
        return

    by_task      = result.get("_by_task", {})
    total_filled = sum(h for k, h in result.items() if k != "_by_task")

    # 若服务器尚未同步刚提交的工时，用本地已知数据补全
    if new_entries:
        submitted_total = sum(e["hours"] for e in new_entries)
        if total_filled < initial_total + submitted_total - 0.1:
            for e in new_entries:
                by_task[e["task_uuid"]] = by_task.get(e["task_uuid"], 0.0) + e["hours"]
                d = e["date"]
                result[d] = result.get(d, 0.0) + e["hours"]
            total_filled = initial_total + submitted_total
            result["_by_task"] = by_task
    gap          = capacity - total_filled
    filled_days  = sum(1 for d in wdays if result.get(d, 0.0) >= 8.0 - 0.01)
    print(f" 已填 {total_filled:.1f}h\n")

    PW, NW = 16, 26
    print("=" * 72)
    print(f"  {year}年{month}月  工时汇总  ({filled_days}/{len(wdays)} 天已满)")
    print("-" * 72)
    print(f"  {_ljust('项目',PW)}  {_ljust('任务',NW)}  {_ljust('状态',10)}  {_rjust('本月已填',8)}  {_rjust('任务剩余',8)}")
    print("-" * 72)

    # 以"本月有工时记录的任务"为基准，而不是遍历所有任务
    # 先建一个 uuid→task_info 映射（活跃任务已有完整信息）
    task_map = {t["uuid"]: t for t in tasks}

    shown_uuids = set()
    # 1. 先展示本月有工时的活跃任务（保持原顺序）
    for t in tasks:
        uuid = t.get("uuid", "")
        if uuid not in by_task:
            continue   # 本月没有工时，不展示
        pname    = (t.get("_proj") or "")[:PW]
        tname    = (t.get("summary") or "")[:NW]
        sname    = (t.get("_status_name") or "")[:10]
        filed    = by_task[uuid]
        task_rem = t.get("_remaining", 0.0)
        fil_s    = f"{filed:.1f}h"
        rem_s    = f"{task_rem:.0f}h" if task_rem > 0 else "—"
        print(f"  {_ljust(pname,PW)}  {_ljust(tname,NW)}  {_ljust(sname,10)}  {_rjust(fil_s,8)}  {_rjust(rem_s,8)}")
        shown_uuids.add(uuid)

    # 2. by_task 里有但不在活跃任务里的（已完成任务或其他）
    other_uuids = [u for u in by_task if u not in shown_uuids]
    if other_uuids:
        other_total = sum(by_task[u] for u in other_uuids)
        label_w = PW + NW + 4
        print(f"  {_ljust('其他任务（已完成等）', label_w)}  {other_total:>7.1f}h  {_rjust('—',8)}")
        # 注：工时查询已按本月 startTime 过滤，跨月任务只统计本月部分

    print("-" * 72)
    print(f"  合计: {total_filled:.1f}h / {capacity}h", end="")
    if gap > 0.01:
        print(f"  ⚠ 还差 {gap:.1f}h")
    else:
        print(f"  ✓ 已填满")
    print("=" * 72)

    # ── 阶段3：已过了"进行中"的中间状态（如完成审核中 → 已完成）─────────
    # 只处理不在"进行中"的 in_progress 任务（阶段2已处理"进行中"）
    review_tasks = [t for t in tasks
                    if t.get("_category") == "in_progress"
                    and "进行中" not in (t.get("_status_name") or "")
                    and _find_step(cfg, t) is not None
                    and _eligible_for_update(t, year, month)]
    if review_tasks:
        batch_status_update(
            cfg, team_uuid, review_tasks,
            from_category="in_progress", to_category="done",
            prompt_label="提交审核 → 已完成",
            debug=debug,
        )


if __name__ == "__main__":
    main()
