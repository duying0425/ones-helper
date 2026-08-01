// api.js — ONES / 北森 HTTP 请求封装（移植自 Python _request/_graphql 等）
// 浏览器扩展中 fetch 自带 Cookie（同域），但仍需手动注入 Authorization / Ones-User-Id

const BASE_URL = "https://ones.reachauto.com/project/api/project";
const OQL_BASE = "https://ones.reachauto.com/project/api/ones-project";
const GRAPHQL_PATH = "/team/{team}/items/graphql";

// 探测到的北森用户信息缓存（避免每次请求都探测）
let detectedUserCache = null;

// === Cookie 操作 ===

// 从浏览器读取 ONES 的关键 Cookie
// 多策略读取：
//  1. getAll({}) - 普通读取
//  2. getAll({ partitionKey: null }) - 读取所有 partitioned cookie（CHIPS）
//  3. getAll({ url: "https://ones.reachauto.com/" }) - 按 URL 读取
// 合并去重后按 domain / url 过滤 reachauto 相关的凭证 Cookie
export async function readOnesCookies() {
  const allCookies = [];
  const seen = new Set();

  const addCookie = (c) => {
    if (!c || !c.name) return;
    const k = `${c.name}@${c.domain}@${c.path}`;
    if (!seen.has(k)) {
      seen.add(k);
      allCookies.push(c);
    }
  };

  // 多维度针对性检索：无盲角覆盖各种 domain、subdomain 和 url 组合
  const queries = [
    { domain: "reachauto.com" },
    { domain: ".reachauto.com" },
    { domain: "ones.reachauto.com" },
    { domain: ".ones.reachauto.com" },
    { url: "https://ones.reachauto.com/project/" },
    { url: "https://ones.reachauto.com/" },
    { url: "https://reachauto.com/" },
    { partitionKey: null },
    {}
  ];

  for (const q of queries) {
    try {
      const list = await chrome.cookies.getAll(q);
      if (Array.isArray(list)) {
        for (const c of list) addCookie(c);
      }
    } catch (e) {}
  }

  // 过滤 reachauto 相关
  const ones = allCookies.filter(c => c.domain && c.domain.includes("reachauto.com"));

  const map = {};
  for (const c of ones) map[c.name] = c.value;

  // 1. 查找名称形如 ones-lt / ones_lt / token 的 Cookie
  let bestToken = map["ones-lt"] || map["ones_lt"] || map["token"] || map["access_token"] || "";

  // 2. 遍历所有 JWT 候选 Token (形如 eyJ...)，优先挑选未过期、且过期时间最晚的合法 Token
  const jwtCandidates = ones.filter(c => c.value && c.value.startsWith("eyJ") && c.value.length > 50);
  if (jwtCandidates.length > 0) {
    const now = Math.floor(Date.now() / 1000);
    let maxExp = 0;
    for (const c of jwtCandidates) {
      const exp = jwtExp(c.value);
      if (exp > now) {
        if (exp > maxExp) {
          maxExp = exp;
          bestToken = c.value;
        }
      } else if (!bestToken) {
        bestToken = c.value;
      }
    }
  }

  if (bestToken) map["ones-lt"] = bestToken;

  const authToken = bestToken || "";
  const userId = jwtUserId(authToken);

  return {
    auth_token: authToken,
    session_id: map["ones-ids-sid"] || map["session_id"] || "",
    user_id: userId,
    org_uuid: map["ones-org-uuid"] || "6ZKXo9yg",
    raw: map,
    cookieNames: Object.keys(map),
    hasAnyCookie: ones.length > 0,
    allCookieCount: ones.length
  };
}

// 从浏览器读取北森考勤系统的 Cookie
export async function readItalentCookies() {
  const queries = [
    { domain: "italent.cn" },
    { domain: ".italent.cn" },
    { domain: "cloud.italent.cn" },
    { domain: ".cloud.italent.cn" },
    { domain: "www.italent.cn" },
    { url: "https://cloud.italent.cn/" },
    { url: "https://www.italent.cn/" }
  ];
  const allCookies = [];
  const seen = new Set();
  for (const q of queries) {
    try {
      const cookies = await chrome.cookies.getAll(q);
      for (const c of cookies) {
        const key = `${c.name}@${c.domain}@${c.path}`;
        if (!seen.has(key)) {
          seen.add(key);
          allCookies.push(c);
        }
      }
    } catch (e) {}
  }
  const raw = {};
  const parts = [];
  for (const c of allCookies) {
    raw[c.name] = c.value;
    parts.push(`${c.name}=${c.value}`);
  }
  return {
    cookieStr: parts.join("; "),
    hasCookie: allCookies.length > 0,
    quark_s: raw["quark_s"] || raw["_quark_s"] || "",
    vid: raw["vid"] || raw["_vid"] || "",
    raw
  };
}

// 自动探测北森当前登录用户的 ID 和显示名
// 尝试多个可能的用户信息接口，返回 { userId, userText } 或 null
export async function detectItalentUser(cookieStr = "", debug = false) {
  // 北森用户信息接口候选（按可能性排序）
  const userApis = [
    "https://cloud.italent.cn/api/v1/User/GetUserInfo",
    "https://www.italent.cn/api/v1/User/GetUserInfo",
    "https://cloud.italent.cn/api/v2/User/GetCurrentUser",
    "https://www.italent.cn/api/v2/User/GetCurrentUser"
  ];
  const headers = {
    "Accept": "application/json, text/plain, */*",
    "X-Sourced-By": "ajax"
  };
  if (cookieStr) headers["Cookie"] = cookieStr;

  for (const url of userApis) {
    try {
      if (debug) console.log(`  [Italent] 尝试探测用户: ${url}`);
      const resp = await fetch(url, {
        method: "GET",
        headers,
        credentials: "include"   // 扩展有 host_permissions，会自动带 cookie
      });
      if (!resp.ok) continue;
      const text = await resp.text();
      if (debug) console.log(`  [Italent] 响应: ${text.slice(0, 200)}`);
      let data;
      try { data = JSON.parse(text); } catch (e) { continue; }

      // 在 JSON 中递归查找可能的用户 ID 字段
      const idFields = ["StaffId", "StaffID", "staffId", "userId", "UserID", "id", "Id", "EmployeeId", "EmpCode"];
      const nameFields = ["Name", "DisplayName", "name", "UserName", "RealName", "nickName"];
      const found = findFields(data, idFields, nameFields);
      if (found) return found;
    } catch (e) {
      continue;
    }
  }

  // 降级：fetch 北森首页 HTML，尝试从内嵌的 JS 全局变量中提取
  try {
    if (debug) console.log("  [Italent] 降级：解析首页 HTML");
    const resp = await fetch("https://www.italent.cn/", { credentials: "include" });
    if (resp.ok) {
      const html = await resp.text();
      // 北森 SPA 通常在 HTML 中嵌入 window.__INITIAL_STATE__ 或类似变量
      const idMatch = html.match(/(?:userId|StaffId|staffId|empId)["':\s]+["']?([^"'&\s,}]+)/i);
      const nameMatch = html.match(/(?:userName|name|displayName|realName)["':\s]+["']([^"'&]{1,50})["']/i);
      if (idMatch) {
        return { userId: idMatch[1], userText: nameMatch ? nameMatch[1] : idMatch[1] };
      }
    }
  } catch (e) { /* ignore */ }

  return null;
}

// 在 JSON 中递归查找用户 ID 和名称字段
function findFields(obj, idFields, nameFields, depth = 0) {
  if (depth > 5 || !obj || typeof obj !== "object") return null;
  let userId = "", userText = "";
  function walk(o) {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (!userId && idFields.includes(k) && v) {
        userId = String(v);
      }
      if (!userText && nameFields.includes(k) && v) {
        userText = String(v);
      }
      if (userId && userText) return;
      if (v && typeof v === "object") walk(v);
    }
  }
  walk(obj);
  if (userId) return { userId, userText: userText || userId };
  return null;
}

// 从 JWT 中解析过期时间戳（秒），失败返回 0
export function jwtExp(token) {
  try {
    const payload = token.split(".")[1];
    const padded = payload + "=".repeat((4 - payload.length % 4) % 4);
    const json = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
    return json.exp || 0;
  } catch (e) {
    return 0;
  }
}

// 从 JWT 解析 org_user_uuid（用于 API 请求头）
export function jwtUserId(token) {
  try {
    const payload = token.split(".")[1];
    const padded = payload + "=".repeat((4 - payload.length % 4) % 4);
    const json = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
    return json.org_user_uuid || json.user_uuid || "";
  } catch (e) {
    return "";
  }
}

// 组装 Cookie 字符串（与 Python 命令行模式 _build_cookie 保持一致）
export function buildCookieStr(cfg) {
  const token = cfg.auth_token || "";
  const sid = cfg.session_id || "";
  const parts = [];
  if (token) parts.push(`ones-lt=${token}`);
  if (sid) parts.push(`ones-ids-sid=${sid}`);
  parts.push("ones-lang=zh");
  parts.push("ones-region-uuid=default");
  parts.push(`ones-org-uuid=${cfg.org_uuid || "6ZKXo9yg"}`);
  return parts.join("; ");
}

// 用 session_id 刷新 ones-lt token，返回新 token 或 null
export async function tryRefreshToken(cfg) {
  const refreshUrls = [
    "https://ones.reachauto.com/project/api/auth/token/refresh",
    "https://ones.reachauto.com/project/api/auth/sso/token",
    "https://ones.reachauto.com/ones/project/api/auth/token"
  ];
  const headers = {
    "Content-Type": "application/json",
    "Origin": "https://ones.reachauto.com",
    "Referer": "https://ones.reachauto.com/project/"
  };
  const cookieStr = buildCookieStr(cfg);
  if (cookieStr) {
    headers["Cookie"] = cookieStr;
  }

  for (const url of refreshUrls) {
    try {
      const resp = await fetch(url, { method: "GET", headers, credentials: "include" });
      if (!resp.ok) continue;
      const data = await resp.json();
      const newToken = (data.data || data)["ones-lt"] || data.access_token;
      if (newToken) return newToken;
    } catch (e) {
      continue;
    }
  }
  return null;
}

// === 通用请求 ===

// ONES API 请求：完全匹配 CLI 命令行模式 _request
// 同时带上 Authorization, Ones-User-Id, Cookie, Origin, Referer Headers
export async function request(cfg, method, url, body = null, debug = false) {
  const headers = {
    "Content-Type": "application/json;charset=UTF-8",
    "Origin": "https://ones.reachauto.com",
    "Referer": "https://ones.reachauto.com/project/"
  };
  // 如果有 token，加上 Authorization
  if (cfg.auth_token) {
    headers["Authorization"] = `Bearer ${cfg.auth_token}`;
  }
  if (cfg.user_id) {
    headers["Ones-User-Id"] = cfg.user_id;
  }
  const cookieStr = buildCookieStr(cfg);
  if (cookieStr) {
    headers["Cookie"] = cookieStr;
  }

  const opts = { method, headers, credentials: "include" };
  if (body) opts.body = JSON.stringify(body);

  if (debug) console.log(`  [${method}] ${url}`, body ? JSON.stringify(body).slice(0, 400) : "");

  try {
    const resp = await fetch(url, opts);
    const text = await resp.text();
    if (debug) console.log(`  [状态] ${resp.status}  [响应] ${text.slice(0, 500)}`);
    let data = {};
    if (text.trim()) {
      try { data = JSON.parse(text); } catch (e) { data = { _raw: text }; }
    }
    return { code: resp.status, data };
  } catch (e) {
    if (debug) console.log(`  [异常] ${e.message}`);
    return { code: 0, data: {} };
  }
}

// GraphQL 请求
export async function gql(cfg, teamUuid, query, tag = "", debug = false) {
  let url = `${BASE_URL}${GRAPHQL_PATH.replace("{team}", teamUuid)}`;
  if (tag) url += `?t=${tag}`;
  const { code, data } = await request(cfg, "POST", url, { query }, debug);
  if (code === 200 && data && data.data !== undefined) return data.data;
  if (debug && code !== 200) console.log(`  [GraphQL 失败] code=${code}`);
  return null;
}

// OQL 请求
export async function oql(cfg, teamUuid, query, debug = false) {
  const url = `${OQL_BASE}/team/${teamUuid}/workitems/onesql`;
  const { code, data } = await request(cfg, "POST", url, { query }, debug);
  return { code, data };
}

// === 业务接口 ===

const CAT_CN = { to_do: "未开始", in_progress: "进行中", done: "已完成" };

// 获取 ONES 当前登录用户的姓名
// 策略1: 直接请求 ONES 官方用户信息 API: /project/api/project/users/me
// 策略2: 从 JWT token payload 中提取
// 策略3: 降级探测 HTML 及其他 me 接口变体
export async function fetchOnesUserName(cfg, debug = false) {
  // 策略1: 直接调用官方用户信息 API
  try {
    const url = "https://ones.reachauto.com/project/api/project/users/me";
    const { code, data } = await request(cfg, "GET", url, null, debug);
    if (code === 200 && data) {
      const user = data.data || data.user || data;
      if (user && typeof user === "object") {
        const name = user.name || user.nickname || user.realName || user.displayName || "";
        const email = user.email || user.mail || "";
        if (name) return { name, email, source: "api_users_me" };
      }
    }
  } catch (e) { /* ignore */ }

  // 策略2: 从 JWT token 的 payload 中提取用户名
  if (cfg.auth_token) {
    try {
      const payload = cfg.auth_token.split(".")[1];
      const padded = payload + "=".repeat((4 - payload.length % 4) % 4);
      const json = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
      const name = json.name || json.nickname || json.realName || json.displayName
                || json.user_name || json.userName || json.fullname || json.fullName || "";
      const email = json.email || json.mail || "";
      if (name) return { name, email, source: "jwt" };
    } catch (e) { /* ignore */ }
  }

  // 策略3: 从 ONES 主页 HTML 中提取用户名
  try {
    const resp = await fetch("https://ones.reachauto.com/project/", {
      method: "GET",
      credentials: "include",
      redirect: "follow"
    });
    if (resp.ok) {
      const html = await resp.text();
      const fieldPatterns = [
        /"realName"\s*:\s*"([\u4e00-\u9fa5a-zA-Z][\u4e00-\u9fa5a-zA-Z\s]{1,29})"/,
        /"displayName"\s*:\s*"([\u4e00-\u9fa5a-zA-Z][\u4e00-\u9fa5a-zA-Z\s]{1,29})"/,
        /"nickname"\s*:\s*"([\u4e00-\u9fa5a-zA-Z][\u4e00-\u9fa5a-zA-Z\s]{1,29})"/,
        /"userName"\s*:\s*"([\u4e00-\u9fa5a-zA-Z][\u4e00-\u9fa5a-zA-Z\s]{1,29})"/,
        /"name"\s*:\s*"([\u4e00-\u9fa5]{2,10})"/,
      ];
      for (const p of fieldPatterns) {
        const m = html.match(p);
        if (m && m[1]) return { name: m[1], email: "", source: "html" };
      }
    }
  } catch (e) { /* ignore */ }

  return null;
}

// GraphQL 补全任务的 issue_type
async function fetchIssueTypes(cfg, teamUuid, tasks, debug = false) {
  if (!tasks.length) return;
  const uuidSet = new Set(tasks.filter(t => t.uuid).map(t => t.uuid));
  const uuidMap = new Map(tasks.map(t => [t.uuid, t]));
  const q = `{ tasks(filter:{assign:{uuid_in:["${cfg.user_id}"]}},limit:200){ uuid alternativeIssueType { name } } }`;
  const gdata = await gql(cfg, teamUuid, q, "", debug);
  for (const t of (gdata && gdata.tasks) || []) {
    if (uuidSet.has(t.uuid)) {
      uuidMap.get(t.uuid)._issue_type = (t.alternativeIssueType || {}).name || "";
    }
  }
}

// OQL 查询我负责的未完成任务
export async function fetchTasks(cfg, teamUuid, debug = false) {
  if (debug) console.log("\n[DEBUG] OQL 查询我负责的未完成任务...");

  const oqlQuery = (
    "select uid(uuid,field001,field006.uuid,field006.name," +
    "field005.uuid,field005.name,field005.category," +
    "toDate(field027),toDate(field028),field019,field020) " +
    "from issue " +
    "where uid(field017) IN (uid('to_do'), uid('in_progress')) " +
    "AND uid(field004) IN (currentUser()) " +
    "order by field009 desc " +
    "limit 0, 200"
  );
  const { code, data } = await oql(cfg, teamUuid, oqlQuery, debug);

  if (code === 200 && Array.isArray(data.data)) {
    const tasks = [];
    for (const row of data.data) {
      const item = row.item || {};
      const uuid = item.uuid || "";
      const name = item.field001 || "未命名";
      const proj = item.field006 || {};
      const pname = proj.name || "";
      const status = item.field005 || {};
      const cat = status.category || "";
      const sname = status.name || CAT_CN[cat] || cat;
      const suuid = status.uuid || "";
      const remaining = (item.field020 || 0) / 100000.0;
      const actual = (item.field019 || 0) / 100000.0;
      const estimated = Math.round((actual + remaining) * 10) / 10;
      const planStart = item.field027 || "";
      const planEnd = item.field028 || "";
      tasks.push({
        uuid,
        summary: name,
        _proj: pname,
        _display: pname ? `[${pname}] ${name}` : name,
        _done: false,
        _remaining: remaining,
        _estimated: estimated,
        _actual: actual,
        _plan_start: planStart,
        _plan_end: planEnd,
        _category: cat,
        _status_name: sname,
        _status_uuid: suuid,
        _issue_type: ""
      });
    }
    await fetchIssueTypes(cfg, teamUuid, tasks, debug);
    return { tasks, code: 200, reason: "" };
  }

  // OQL 失败 —— 区分认证失败 vs 其他错误
  if (code === 401 || code === 403) {
    return { tasks: [], code, reason: `OQL 认证失败（HTTP ${code}），token 无效或已过期` };
  }
  if (code === 404) {
    return { tasks: [], code, reason: `OQL 接口 404，team_uuid 可能不对：${teamUuid}` };
  }
  if (code === 0) {
    return { tasks: [], code, reason: "OQL 请求失败（网络错误或被 CORS 拦截）" };
  }

  // fallback: GraphQL
  if (debug) console.log(`  OQL 失败(${code})，降级到 GraphQL...`);
  const q = `{ tasks(filter:{assign:{uuid_in:["${cfg.user_id}"]}}, limit:50) { uuid summary project { uuid name } } }`;
  const gdata = await gql(cfg, teamUuid, q, "", debug);
  if (gdata && gdata.tasks) {
    const tasks = gdata.tasks.map(t => {
      const pname = (t.project || {}).name || "";
      return {
        uuid: t.uuid,
        summary: t.summary,
        _proj: pname,
        _display: pname ? `[${pname}] ${t.summary}` : t.summary,
        _done: false,
        _category: "",
        _status_name: "",
        _status_uuid: "",
        _issue_type: ""
      };
    });
    return { tasks, code: 200, reason: "" };
  }
  return { tasks: [], code, reason: `OQL/GraphQL 均失败（HTTP ${code}）` };
}

// GraphQL 查询指定 UUID 列表的任务详情（用于展示已完成任务工时明细）
export async function fetchTasksByUuids(cfg, teamUuid, uuids, debug = false) {
  if (!uuids.length) return {};
  const uuidList = uuids.join('","');
  const q = `{ tasks(filter:{uuid_in:["${uuidList}"]},limit:200){ uuid summary project { uuid name } status { uuid name category } } }`;
  const gdata = await gql(cfg, teamUuid, q, "", debug);
  const result = {};
  for (const t of (gdata && gdata.tasks) || []) {
    const uuid = t.uuid || "";
    const proj = (t.project || {}).name || "";
    const sinfo = t.status || {};
    result[uuid] = {
      uuid,
      summary: t.summary || "",
      _proj: proj,
      _status_name: sinfo.name || "",
      _category: sinfo.category || "",
      _remaining: 0.0
    };
  }
  return result;
}

// GraphQL 查询当月已填工时
// 返回 {dateStr: hours, ..., _by_task: {task_uuid: hours}} 或 null
export async function fetchFilledHours(cfg, teamUuid, year, month, debug = false) {
  const uid = cfg.user_id || "";
  const q = `{ manhours(filter:{ owner:{uuid_in:["${uid}"]} } orderBy:{ startTime:DESC } limit:500) { uuid startTime hours type task { uuid } } }`;
  const data = await gql(cfg, teamUuid, q, "", debug);
  if (data === null) return null;

  const byDate = {};
  const byTask = {};
  for (const mh of data.manhours || []) {
    if (mh.type !== "recorded") continue;
    const ts = mh.startTime || 0;
    if (!ts) continue;
    const d = new Date(ts * 1000);
    if (d.getFullYear() !== year || (d.getMonth() + 1) !== month) continue;
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const h = (mh.hours || 0) / 100000.0;
    byDate[dateStr] = (byDate[dateStr] || 0.0) + h;
    const tuuid = (mh.task || {}).uuid || "";
    if (tuuid) byTask[tuuid] = (byTask[tuuid] || 0.0) + h;
  }
  byDate._by_task = byTask;
  return byDate;
}

// 添加工时（GraphQL mutation）
// 注意：GraphQL 规范要求使用 $var 变量时必须在 mutation 头部声明类型，且参数间用逗号分隔
const ADD_MANHOUR_QUERY = `
  mutation AddManhour(
    $mode: String!,
    $owner: String!,
    $task: String!,
    $type: String!,
    $start_time: Int!,
    $hours: Int!,
    $description: String!
  ) {
    addManhour(mode: $mode, owner: $owner, task: $task, type: $type,
               start_time: $start_time, hours: $hours, description: $description) {
      key
    }
  }
`;

export async function submitEntry(cfg, teamUuid, entry, debug = false) {
  // entry.date 是 "YYYY-MM-DD" 字符串
  const dt = new Date(`${entry.date}T09:00:00`);
  const url = `${BASE_URL}${GRAPHQL_PATH.replace("{team}", teamUuid)}?t=AddManhour`;
  const body = {
    query: ADD_MANHOUR_QUERY,
    variables: {
      mode: "simple",
      owner: cfg.user_id,
      task: entry.task_uuid,
      type: "recorded",
      start_time: Math.floor(dt.getTime() / 1000),
      hours: Math.round(entry.hours * 100000),
      description: ""
    }
  };
  const { code, data } = await request(cfg, "POST", url, body, debug);
  if (code === 200) {
    const key = ((data.data || {}).addManhour || {}).key || "";
    if (key) return { ok: true, msg: key };
    if (data.data !== undefined && !data.errors) return { ok: true, msg: String(data.data).slice(0, 40) };
  }
  return { ok: false, msg: `HTTP ${code}: ${JSON.stringify(data).slice(0, 100)}` };
}

// === 状态流转 ===

const TRANSITIONS_CACHE = new Map();

// GET /team/{team}/issue/{task_uuid}/v2/transitions
export async function fetchTransitions(cfg, teamUuid, taskUuid, debug = false) {
  if (TRANSITIONS_CACHE.has(taskUuid)) return TRANSITIONS_CACHE.get(taskUuid);
  const url = `${OQL_BASE}/team/${teamUuid}/issue/${taskUuid}/v2/transitions`;
  const { code, data } = await request(cfg, "GET", url, null, debug);
  let transitions = [];
  if (code === 200) {
    if (Array.isArray(data)) transitions = data;
    else if (Array.isArray(data.transitions)) transitions = data.transitions;
    else if (Array.isArray(data.data)) transitions = data.data;
  }
  TRANSITIONS_CACHE.set(taskUuid, transitions);
  return transitions;
}

// 从可用流转中挑选目标流转
export function pickTransition(transitions, buttonHint = "", toCategory = "", knownStatuses = null, last = false) {
  if (!transitions) return null;
  const knownCat = knownStatuses || {};

  if (buttonHint) {
    const matches = transitions.filter(tr => (tr.name || "").includes(buttonHint));
    if (matches.length) return last ? matches[matches.length - 1] : matches[0];
  }
  if (toCategory) {
    const matches = transitions.filter(tr => knownCat[tr.end_status_uuid || ""] === toCategory);
    if (matches.length) return last ? matches[matches.length - 1] : matches[0];
  }
  return null;
}

// 构建 ONES 评论 HTML
function makeCommentHtml(text) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let blockId = "";
  for (let i = 0; i < 8; i++) blockId += chars[Math.floor(Math.random() * chars.length)];
  const doc = {
    blocks: { root: [{ id: blockId, type: "text", text: [{ insert: text }] }] },
    meta: {},
    comments: {}
  };
  const docB64 = btoa(unescape(encodeURIComponent(JSON.stringify(doc))));
  const textB64 = btoa(unescape(encodeURIComponent(text)));
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<ones-editor-doc data-source="ones-editor-doc::${docB64}::ones-editor-doc"></ones-editor-doc>` +
    `<meta name="ones-editor-text" content="${textB64}" />` +
    `</head><body><p>    </p></body></html>`
  );
}

// 执行状态流转
export async function executeTransition(cfg, teamUuid, taskUuid, transitionUuid, comment = "", debug = false) {
  const url = `${BASE_URL}/team/${teamUuid}/task/${taskUuid}/new_transit`;
  let fieldValues = [];
  if (comment) {
    fieldValues = [{ field_uuid: "field057", value: makeCommentHtml(comment) }];
  }
  const body = { transition_uuid: transitionUuid, field_values: fieldValues };
  const { code, data } = await request(cfg, "POST", url, body, debug);
  if (code === 200 || code === 204) {
    const errs = (data && typeof data === "object") ? data.errors : null;
    if (!errs) return { ok: true, reason: "" };
    return { ok: false, reason: String((errs[0] || {}).message || errs[0] || "").slice(0, 80) };
  }
  let reason = "";
  if (data && typeof data === "object") {
    reason = data.desc || data.errcode || `HTTP ${code}`;
  } else {
    reason = `HTTP ${code}`;
  }
  return { ok: false, reason: String(reason).slice(0, 80) };
}

// === 北森考勤 ===

// 在 JSON 中递归查找键名包含 patterns 之一的项
function findKeyByPattern(obj, patterns, defaultVal = null) {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const k of Object.keys(obj)) {
      for (const pat of patterns) {
        if (k.toLowerCase().includes(pat.toLowerCase())) return k;
      }
    }
    for (const v of Object.values(obj)) {
      const res = findKeyByPattern(v, patterns);
      if (res) return res;
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      const res = findKeyByPattern(item, patterns);
      if (res) return res;
    }
  }
  return defaultVal;
}

// 寻找 JSON 中的记录列表
function extractPageList(data) {
  if (!data || typeof data !== "object") return null;
  for (const k of ["pageList", "pagelist", "data", "records", "rows", "list"]) {
    if (Array.isArray(data[k])) return data[k];
  }
  for (const v of Object.values(data)) {
    if (v && typeof v === "object") {
      const res = extractPageList(v);
      if (res) return res;
    }
  }
  return null;
}

// 获取北森考勤数据
// Cookie 通过 credentials: "include" 让浏览器自动带，不依赖 chrome.cookies API
// 所有字段（quark_s/vid/userId）均自动从浏览器探测，无需用户手动配置
export async function fetchItalentAttendance(cfg, year, month, debug = false) {
  let cookieStr = "";
  let quarkS = "";
  let vid = cfg.italent_vid || "";
  // 尝试读取 cookie（仅用于探测 userId 和提取 quark_s/vid）
  try {
    const italentCookies = await readItalentCookies();
    cookieStr = italentCookies.cookieStr;
    if (!quarkS && italentCookies.quark_s) quarkS = italentCookies.quark_s;
    if (!vid && italentCookies.vid) vid = italentCookies.vid;
  } catch (e) {
    if (debug) console.log("  [Italent] 读取 Cookie 失败（将继续用 credentials:include 发请求）:", e.message);
  }

  if (!cookieStr) {
    return { data: null, reason: "未找到 italent.cn Cookie，请先在浏览器登录 cloud.italent.cn" };
  }

  const url = cfg.italent_api_url ||
    "https://cloud.italent.cn/api/v2/UI/TableList" +
    "?viewName=Attendance.SingleObjectListView.EmpAttendanceDataList" +
    "&metaObjName=Attendance.AttendanceStatistics&app=Attendance" +
    "&PaaS-SourceApp=Attendance&PaaS-CurrentView=Attendance.AttendanceDataRecordNavView" +
    "&frontendVersion=2025121900" +
    "&shadow_context=%7BappModel%3A%22italent%22%2Cuppid%3A%221%22%7D&_qsrcapp=attendance";

  const fullUrl = quarkS ? `${url}&quark_s=${quarkS}` : url;

  const lastDay = new Date(year, month, 0).getDate();
  const dateRange = `${year}/${String(month).padStart(2, "0")}/01-${year}/${String(month).padStart(2, "0")}/${String(lastDay).padStart(2, "0")}`;

  // userId 必须使用北森专用的 italent_user_id，绝不能错用 ONES 的 user_id (UUID)
  let userId = cfg.italent_user_id || "";
  let userText = cfg.italent_user_text || "";
  if (!userId) {
    try {
      const detected = await detectItalentUser(cookieStr, debug);
      if (detected) {
        userId = detected.userId;
        userText = detected.userText || userId;
        await saveConfig({ italent_user_id: userId, italent_user_text: userText });
      }
    } catch (e) {}
  }

  const headers = {
    "Accept": "application/json, application/xml, text/play, text/html, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Content-Type": "application/json; charset=utf-8",
    "Origin": "https://www.italent.cn",
    "Referer": "https://www.italent.cn/",
    "X-Sourced-By": "ajax"
  };
  if (vid) headers["vid"] = vid;
  // 显式注入 Cookie Header，防止跨域 fetch 隐式带 cookie 遗失
  if (cookieStr) headers["Cookie"] = cookieStr;

  const searchItems = [];
  if (userId) {
    searchItems.push({
      name: "Attendance.AttendanceStatistics.StaffId",
      text: userText || userId, value: userId, num: "1",
      metaObjName: "", metaFieldRelationIDPath: "", queryAreaSubNodes: false
    });
  }
  searchItems.push(
    {
      name: "Attendance.AttendanceStatistics.StdIsDeleted",
      text: "否", value: "0", num: "5",
      metaObjName: "", metaFieldRelationIDPath: "", queryAreaSubNodes: false
    },
    {
      name: "Attendance.AttendanceStatistics.Status",
      text: "启用", value: "1", num: "6",
      metaObjName: "", metaFieldRelationIDPath: "", queryAreaSubNodes: false
    },
    {
      name: "Attendance.AttendanceStatistics.SwipingCardDate",
      text: dateRange, value: dateRange, num: "",
      metaObjName: "", metaFieldRelationIDPath: "", queryAreaSubNodes: false
    }
  );

  const body = {
    table_data: {
      advance: { cmp_render: { viewPath: "MyAttendanceStatisticsTable", status: "enable" } },
      hasCheckColumn: true,
      ext_data: { ListViewLabel: "我的考勤列表" },
      columnGroups: null,
      isEnableGlobleCheck: false,
      hasRowHandler: true,
      paging: { total: 0, capacity: 100, page: 0, capacityList: [15, 30, 60, 100] },
      isAvatars: true,
      viewName: "Attendance.SingleObjectListView.EmpAttendanceDataList",
      operateColumWidth: 140,
      extendsParam: "",
      isSyncRowHandler: true,
      isFrozenOperationColumnHandler: false,
      isCustomListViewExisted: true,
      getTreeNodeUrl: null,
      sort_fields: [{ sort_column: "SwipingCardDate", sort_dir: "desc" }],
      linkRuleJsonV2: null,
      description: "员工出勤列表",
      metaObjName: "Attendance.AttendanceStatistics",
      isCustomListView: true,
      navViewIsCustom: false,
      navViewName: "Attendance.AttendanceDataRecordNavView",
      navViewVersion: "20240125162251229"
    },
    search_data: {
      metaObjName: "Attendance.AttendanceStatistics",
      searchView: "Attendance.EmpAttendanceDataSearch",
      items: searchItems,
      searchFormFilterJson: null
    }
  };

  if (debug) console.log(`  [Italent] 请求北森接口: ${fullUrl.slice(0, 100)}...`);
  try {
    const resp = await fetch(fullUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      credentials: "include"
    });
    const text = await resp.text();
    if (!resp.ok) {
      return { data: null, reason: `北森 API HTTP ${resp.status}` };
    }
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    if (!json) {
      return { data: null, reason: "北森返回非 JSON 响应" };
    }
    if (json.code && json.code !== 200 && json.code !== "200" && json.code !== 0) {
      return { data: null, reason: `北森提示: ${json.message || json.code}` };
    }
    return { data: json, reason: "ok" };
  } catch (e) {
    return { data: null, reason: `网络请求失败: ${e.message}` };
  }
}

// 解析北森考勤数据，返回 {dateStr: overtimeHours}
export function parseItalentAttendance(data, year, month, debug = false, cfg = null) {
  let records = (data && data.biz_data) || null;
  if (!records && data) records = extractPageList(data);
  if (!records) {
    if (debug) console.log("  [Italent] 未找到数据列表");
    return {};
  }

  let stdHours = 9.0;
  if (cfg && cfg.italent_standard_work_hours) {
    stdHours = parseFloat(cfg.italent_standard_work_hours) || 9.0;
  }

  const overtimeMap = {};
  for (const r of records) {
    if (!r || typeof r !== "object") continue;

    const sc = r.SwipingCardDate || {};
    let dateStr = "";
    if (typeof sc === "object") dateStr = sc.value || sc.text || "";
    else dateStr = String(sc);

    const m = dateStr.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (!m) continue;
    const y = parseInt(m[1]), mo = parseInt(m[2]), d = parseInt(m[3]);
    if (y !== year || mo !== month) continue;

    const dateKey = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

    const wp = r.WorkPeriod || {};
    let wpStr = "0";
    if (typeof wp === "object") wpStr = wp.value || wp.text || "0";
    else wpStr = String(wp);
    const workPeriod = parseFloat(wpStr) || 0.0;

    const dtObj = r.DateType || {};
    let dateTypeText = "";
    if (typeof dtObj === "object") dateTypeText = dtObj.text || "";
    else dateTypeText = String(dtObj);
    const isWorkday = !dateTypeText.includes("公休") && !dateTypeText.includes("节假") && !dateTypeText.includes("假");

    let ot = 0;
    if (isWorkday) ot = Math.max(0, workPeriod - stdHours);
    else ot = workPeriod;

    if (ot > 0) overtimeMap[dateKey] = Math.floor(ot + 0.5);
  }

  if (debug) {
    console.log("  [Italent] 解析完成:");
    for (const d of Object.keys(overtimeMap).sort()) console.log(`    ${d}: ${overtimeMap[d]}h`);
  }
  return overtimeMap;
}
