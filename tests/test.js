// tests/test.js — ONES Helper 扩展纯函数单元测试
// 参考 MinuteExport 的测试机制：用 Node.js vm 模块加载 extension/ 下的实际源码
// 运行方式：在仓库根目录执行 `node tests/test.js`

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const EXT_DIR = path.resolve(__dirname, "..", "extension");
const SRC_DIR = path.join(EXT_DIR, "src");

let passCount = 0;
let failCount = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    passCount++;
  } else {
    failCount++;
    failures.push(msg);
    console.log(`  ✗ FAIL: ${msg}`);
  }
}

function assertEqual(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passCount++;
  } else {
    failCount++;
    failures.push(`${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
    console.log(`  ✗ FAIL: ${msg}`);
    console.log(`    expected: ${JSON.stringify(expected)}`);
    console.log(`    actual:   ${JSON.stringify(actual)}`);
  }
}

// === 加载源码 ===

// 读取源文件并去掉 ES module 语法（import/export），便于在 vm 沙箱中执行
// 关键：const/let 在 vm 上下文中不会挂到 globalThis，需转为 var
function loadSource(filePath) {
  let code = fs.readFileSync(filePath, "utf-8");
  // 去掉 import 语句（含跨行的情况）
  code = code.replace(/^\s*import\s+[\s\S]*?;\s*$/gm, "");
  code = code.replace(/^\s*import\s+.*$/gm, "");
  // 去掉 export 关键字，并把 const/let 转成 var（vm 沙箱中 var 会挂到 globalThis）
  code = code.replace(/export\s+(async\s+)?function\s/g, "$1function ");
  code = code.replace(/export\s+const\s/g, "var ");
  code = code.replace(/export\s+let\s/g, "var ");
  code = code.replace(/export\s+default\s/g, "");
  // 处理单独的 export 语句，如 "export { FOO };" 或 "export { FOO, BAR };"
  code = code.replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, "");
  return code;
}

// 模拟 chrome API
function createChromeMock() {
  const storageData = { local: {} };
  const cookies = [];
  return {
    storage: {
      local: {
        get: async (key) => {
          if (typeof key === "string") return { [key]: storageData.local[key] };
          return { ...storageData.local };
        },
        set: async (obj) => { Object.assign(storageData.local, obj); },
        _data: storageData.local
      }
    },
    cookies: {
      // 模拟 chrome.cookies.getAll 的语义
      // - 不传参数或传空对象: 返回所有 cookie
      // - 传 domain: 返回 domain 字段包含该值的 cookie
      // - 传 url: 返回所有会发送到该 URL 的 cookie
      getAll: async ({ domain, url } = {}) => {
        if (url) {
          let host = url;
          try { host = new URL(url).hostname; } catch (e) {}
          return cookies.filter(c => {
            const cd = c.domain.startsWith(".") ? c.domain.slice(1) : c.domain;
            return host === cd || host.endsWith("." + cd);
          });
        }
        if (domain) {
          return cookies.filter(c => c.domain.includes(domain));
        }
        return cookies.slice();  // 返回全部
      }
    },
    runtime: { getManifest: () => ({ version: "1.0.0" }) },
    alarms: { create: () => {}, onAlarm: { addListener: () => {} } },
    notifications: { create: () => {} },
    i18n: { getMessage: (key) => key },  // 测试中返回 key 本身
    _cookies: cookies,
    _setCookies: (arr) => { cookies.length = 0; cookies.push(...arr); }
  };
}

function createSandbox() {
  const sandbox = {
    chrome: createChromeMock(),
    console: console,
    Date: Date,
    Math: Math,
    JSON: JSON,
    Set: Set,
    Map: Map,
    Array: Array,
    Object: Object,
    String: String,
    Number: Number,
    Boolean: Boolean,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    setTimeout: setTimeout,
    fetch: async () => ({ ok: false, status: 0, text: async () => "" })
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

// === 测试用例 ===

async function runTests() {
  console.log("\n=== ONES Helper 扩展单元测试 ===\n");

  // --- holidays.js ---
  console.log("[holidays.js]");
  const holidaysSandbox = createSandbox();
  vm.runInContext(loadSource(path.join(SRC_DIR, "holidays.js")), holidaysSandbox);

  // HOLIDAYS 数据
  assert(holidaysSandbox.HOLIDAYS && holidaysSandbox.HOLIDAYS[2025], "HOLIDAYS[2025] 应存在");
  assert(holidaysSandbox.HOLIDAYS[2025].off.has("2025-01-01"), "2025 元旦应为假日 off");
  assert(holidaysSandbox.HOLIDAYS[2025].on.has("2025-01-26"), "2025-01-26 应为补班 on");
  assert(!holidaysSandbox.HOLIDAYS[2025].off.has("2025-03-15"), "2025-03-15 不应是假日");

  // holidaySets 合并
  const sets = holidaysSandbox.holidaySets(2025, {
    extra_holidays: { off: ["2025-07-01"], on: ["2025-07-05"], remove_off: ["2025-01-01"] }
  });
  assert(sets.off.has("2025-07-01"), "holidaySets 应合并 extra off");
  assert(sets.on.has("2025-07-05"), "holidaySets 应合并 extra on");
  assert(!sets.off.has("2025-01-01"), "holidaySets 应移除 remove_off 中的日期");

  // workingDays
  const wdays2025_3 = holidaysSandbox.workingDays(2025, 3, {});
  // 2025-03 没有法定假日，工作日 = 3 月总天数 - 周末天数
  // 3 月有 31 天，周末 10 天（5 个周六 + 5 个周日），工作日 21 天
  assertEqual(wdays2025_3.length, 21, "2025-03 工作日应为 21 天");
  const wdays2025_10 = holidaysSandbox.workingDays(2025, 10, {});
  // 2025-10 有国庆长假，工作日较少
  assert(wdays2025_10.length < 21, "2025-10 因国庆应工作日较少");

  // 2026 节假日与无内置配置年份兜底
  assert(holidaysSandbox.HOLIDAYS && holidaysSandbox.HOLIDAYS[2026], "HOLIDAYS[2026] 应存在");
  assert(holidaysSandbox.HOLIDAYS[2026].off.has("2026-01-01"), "2026 元旦应为假日 off");
  const wdays2030_1 = holidaysSandbox.workingDays(2030, 1, {});
  assert(wdays2030_1.length > 0, "未来无预设节假日的年份应正常排除周末返回工作日");

  // --- distribute.js ---
  console.log("\n[distribute.js]");
  const distSandbox = createSandbox();
  vm.runInContext(loadSource(path.join(SRC_DIR, "distribute.js")), distSandbox);

  // 基本分配
  const r1 = distSandbox.distribute(
    { t1: { name: "T1", uuid: "t1", hours: 8 } },
    ["2025-03-03", "2025-03-04", "2025-03-05"],
    {},
    8.0
  );
  assertEqual(r1.entries.length, 1, "1 个任务 8h 应分配到 1 天");
  assertEqual(r1.entries[0].date, "2025-03-03", "应分配到第一个工作日");
  assertEqual(r1.entries[0].hours, 8, "应分配 8h");

  // 多任务跨天
  const r2 = distSandbox.distribute(
    {
      t1: { name: "T1", uuid: "t1", hours: 10 },
      t2: { name: "T2", uuid: "t2", hours: 6 }
    },
    ["2025-03-03", "2025-03-04", "2025-03-05"],
    {},
    8.0
  );
  assertEqual(r2.entries.length, 3, "16h 跨 2 任务应分 3 条");
  // T1: 8h on 03-03, 2h on 03-04; T2: 6h on 03-04
  const t1Entries = r2.entries.filter(e => e.task_uuid === "t1");
  assertEqual(t1Entries.length, 2, "T1 应跨 2 天");
  assertEqual(t1Entries[0].hours, 8, "T1 第一天 8h");
  assertEqual(t1Entries[1].hours, 2, "T1 第二天 2h");

  // 已填工时扣除
  const r3 = distSandbox.distribute(
    { t1: { name: "T1", uuid: "t1", hours: 8 } },
    ["2025-03-03", "2025-03-04"],
    { "2025-03-03": 4 },  // 第一天已填 4h
    8.0
  );
  assertEqual(r3.entries.length, 2, "第一天剩 4h 应跨 2 天");
  assertEqual(r3.entries[0].hours, 4, "第一天只分配 4h");
  assertEqual(r3.entries[1].hours, 4, "第二天分配 4h");

  // dailyLimit 为 0 时的边界（W2 修复点）
  const r4 = distSandbox.distribute(
    { t1: { name: "T1", uuid: "t1", hours: 8 } },
    ["2025-03-03", "2025-03-04"],
    {},
    { "2025-03-03": 0, "2025-03-04": 8 }  // 第一天上限 0
  );
  assertEqual(r4.entries.length, 1, "第一天上限 0 应不分配，全部到第二天");
  assertEqual(r4.entries[0].date, "2025-03-04", "应分配到第二天");

  // 工作日不足告警
  const r5 = distSandbox.distribute(
    { t1: { name: "T1", uuid: "t1", hours: 100 } },
    ["2025-03-03"],
    {},
    8.0
  );
  assertEqual(r5.entries.length, 1, "工作日不足也应部分分配");
  assertEqual(r5.entries[0].hours, 8, "只分配 8h");

  // 空工时输入
  const rEmpty = distSandbox.distribute({}, ["2025-03-03"], {}, 8.0);
  assertEqual(rEmpty.entries.length, 0, "空任务工时应返回 0 条分配");

  // 加班标记与自定义对象上限
  const rOt = distSandbox.distribute(
    { ot1: { name: "OT Task", uuid: "ot1", hours: 6, is_overtime: true } },
    ["2025-03-03", "2025-03-04"],
    {},
    { "2025-03-03": 12.0, "2025-03-04": 8.0 }
  );
  assertEqual(rOt.entries.length, 1, "加班工时分配条数");
  assertEqual(rOt.entries[0].is_overtime, true, "加班标记应正确传递");
  assertEqual(rOt.entries[0].hours, 6, "按当天上限 12h 应全部分配在第一天");

  // 考勤加班后补充加班优先填入纯 8h 日期 (1/5/4/4/2 场景)
  const wdays5 = ["2025-03-03", "2025-03-04", "2025-03-05", "2025-03-06", "2025-03-07"];
  const otMap5 = { "2025-03-03": 1.0, "2025-03-04": 5.0 };
  const currentFilled5 = { "2025-03-03": 8, "2025-03-04": 8, "2025-03-05": 8, "2025-03-06": 8, "2025-03-07": 8 };

  // 阶段 1：考勤分配 6h
  const attLimit5 = {};
  for (const d of wdays5) attLimit5[d] = 8.0 + (otMap5[d] || 0);
  const rPhase1 = distSandbox.distribute(
    { t1: { name: "T1", uuid: "t1", hours: 6, is_overtime: true } },
    wdays5, currentFilled5, attLimit5
  );
  for (const e of rPhase1.entries) currentFilled5[e.date] += e.hours;

  // 阶段 2：追加 10h 补充加班
  const prioritizedWdays5 = [
    ...wdays5.filter(d => !otMap5[d]),
    ...wdays5.filter(d => !!otMap5[d])
  ];
  const rPhase2 = distSandbox.distribute(
    { t1: { name: "T1", uuid: "t1", hours: 10, is_overtime: true } },
    prioritizedWdays5, currentFilled5, 12.0
  );
  for (const e of rPhase2.entries) currentFilled5[e.date] += e.hours;

  const allOtEntries = [...rPhase1.entries, ...rPhase2.entries].sort((a, b) => a.date.localeCompare(b.date));
  const otByDate = {};
  for (const e of allOtEntries) otByDate[e.date] = (otByDate[e.date] || 0) + e.hours;

  assertEqual(otByDate["2025-03-03"], 1, "1号考勤加班保持 1h");
  assertEqual(otByDate["2025-03-04"], 5, "2号考勤加班保持 5h");
  assertEqual(otByDate["2025-03-05"], 4, "3号纯工作日分配 4h 加班");
  assertEqual(otByDate["2025-03-06"], 4, "4号纯工作日分配 4h 加班");
  assertEqual(otByDate["2025-03-07"], 2, "5号纯工作日分配 2h 加班");

  // --- workflow.js ---
  console.log("\n[workflow.js]");
  const wfSandbox = createSandbox();
  vm.runInContext(loadSource(path.join(SRC_DIR, "workflow.js")), wfSandbox);

  // 默认 workflow 解析
  const wf = wfSandbox.parseWorkflow({});
  assert(wf["任务"], "默认 workflow 应有'任务'类型");
  assert(wf["工作任务"], "默认 workflow 应有'工作任务'类型");
  assertEqual(wf["任务"].length, 2, "'任务'应有 2 个流转步骤");

  // findStep 匹配 from_status
  const step1 = wfSandbox.findStep({}, { _issue_type: "任务", _status_name: "未开始" });
  assert(step1 !== null, "'未开始'应能找到 step");
  assertEqual(step1.button, "开始任务", "按钮应为'开始任务'");
  assertEqual(step1.to_status, "进行中", "目标状态应为'进行中'");

  const step2 = wfSandbox.findStep({}, { _issue_type: "任务", _status_name: "进行中" });
  assert(step2 !== null, "'进行中'应能找到 step");
  assertEqual(step2.button, "完成任务", "按钮应为'完成任务'");

  // 未知类型 fallback
  const step3 = wfSandbox.findStep({}, { _issue_type: "未知类型", _status_name: "未开始" });
  assert(step3 !== null, "未知类型应 fallback 到第一个 workflow");

  // 已完成状态无 step
  const step4 = wfSandbox.findStep({}, { _issue_type: "任务", _status_name: "已完成" });
  assert(step4 === null, "'已完成'应无 step（已是终态）");

  // eligibleForUpdate
  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + 1);
  const futureStr = futureDate.toISOString().slice(0, 10);
  const pastDate = new Date();
  pastDate.setFullYear(pastDate.getFullYear() - 1);
  const pastStr = pastDate.toISOString().slice(0, 10);

  // 计划结束日在未来 → 不应流转（还需继续填工时）
  assert(!wfSandbox.eligibleForUpdate(
    { _plan_end: futureStr, _estimated: 8, _actual: 8 }, 2025, 3
  ), "计划结束日在未来，不应流转");

  // 计划结束日已过且工时填满 → 应流转
  // 注意：eligibleForUpdate 中 pe < today 返回 false，这里用当月内的过去日期
  const todayStr = new Date().toISOString().slice(0, 10);
  assert(wfSandbox.eligibleForUpdate(
    { _plan_end: todayStr, _estimated: 8, _actual: 8 }, new Date().getFullYear(), new Date().getMonth() + 1
  ), "今日结束且工时填满应可流转");

  // isLastStep 判断
  assert(wfSandbox.isLastStep({}, { _issue_type: "任务", _status_name: "进行中" }), "进行中应是'任务'的最后一步流转");
  assert(!wfSandbox.isLastStep({}, { _issue_type: "任务", _status_name: "未开始" }), "未开始不是'任务'的最后一步");

  // eligibleForMonthFullClose
  assert(wfSandbox.eligibleForMonthFullClose(
    { _plan_end: todayStr, _remaining: 5 }, new Date().getFullYear(), new Date().getMonth() + 1
  ), "当月结束且剩余预计 > 0 的任务在月度满时应满足 eligibleForMonthFullClose");
  assert(!wfSandbox.eligibleForMonthFullClose(
    { _plan_end: todayStr, _remaining: 0 }, new Date().getFullYear(), new Date().getMonth() + 1
  ), "无剩余预计的任务不应触发 eligibleForMonthFullClose");

  // --- config.js ---
  console.log("\n[config.js]");
  const cfgSandbox = createSandbox();
  vm.runInContext(loadSource(path.join(SRC_DIR, "config.js")), cfgSandbox);

  const cfg = await cfgSandbox.loadConfig();
  assert(cfg.team_uuid === "SpBJdKsD", "默认 team_uuid 应为 SpBJdKsD");
  assert(cfg.overtime_daily_max === 4, "默认 overtime_daily_max 应为 4");
  assert(cfg.workflow && cfg.workflow["任务"], "默认应有 workflow['任务']");

  // saveConfig 部分更新
  await cfgSandbox.saveConfig({ overtime_daily_max: 6 });
  const cfg2 = await cfgSandbox.loadConfig();
  assertEqual(cfg2.overtime_daily_max, 6, "saveConfig 应部分更新");

  // --- api.js ---
  console.log("\n[api.js]");
  const apiSandbox = createSandbox();
  vm.runInContext(loadSource(path.join(SRC_DIR, "api.js")), apiSandbox);

  // jwtExp 解析
  // 构造一个 exp=1735689600 (2025-01-01) 的 JWT payload
  const payload = Buffer.from(JSON.stringify({ exp: 1735689600 })).toString("base64url");
  const token = `header.${payload}.signature`;
  assertEqual(apiSandbox.jwtExp(token), 1735689600, "jwtExp 应解析 exp");

  // jwtExp 无效 token
  assertEqual(apiSandbox.jwtExp("invalid"), 0, "jwtExp 无效 token 应返回 0");
  assertEqual(apiSandbox.jwtExp(""), 0, "jwtExp 空字符串应返回 0");

  // jwtUserId 解析
  const payload2 = Buffer.from(JSON.stringify({ org_user_uuid: "user-123" })).toString("base64url");
  const token2 = `header.${payload2}.signature`;
  assertEqual(apiSandbox.jwtUserId(token2), "user-123", "jwtUserId 应解析 org_user_uuid");

  // readOnesCookies 从 chrome mock 读取
  apiSandbox.chrome._setCookies([
    { name: "ones-lt", value: "token-abc", domain: "ones.reachauto.com" },
    { name: "ones-uid", value: "uid-xyz", domain: "ones.reachauto.com" },
    { name: "ones-ids-sid", value: "sid-123", domain: "ones.reachauto.com" },
    { name: "other", value: "ignore", domain: "other.com" }
  ]);
  const onesCookies = await apiSandbox.readOnesCookies();
  assertEqual(onesCookies.auth_token, "token-abc", "应读取 ones-lt");
  assertEqual(onesCookies.user_id, "uid-xyz", "应读取 ones-uid");
  assertEqual(onesCookies.session_id, "sid-123", "应读取 ones-ids-sid");

  // pickTransition
  const transitions = [
    { name: "开始任务", uuid: "tr1", end_status_uuid: "s1" },
    { name: "完成任务", uuid: "tr2", end_status_uuid: "s2" },
    { name: "已完成", uuid: "tr3", end_status_uuid: "s3" }
  ];
  const knownStatuses = { s1: "进行中", s2: "完成审核中", s3: "已完成" };

  const tr1 = apiSandbox.pickTransition(transitions, "开始任务");
  assertEqual(tr1.uuid, "tr1", "按按钮名应找到 tr1");

  const tr2 = apiSandbox.pickTransition(transitions, "", "已完成", knownStatuses);
  assertEqual(tr2.uuid, "tr3", "按目标 category 应找到 tr3");

  const tr3 = apiSandbox.pickTransition(transitions, "不存在的按钮");
  assertEqual(tr3, null, "不匹配应返回 null");

  // parseItalentAttendance
  const attendanceData = {
    biz_data: [
      {
        SwipingCardDate: { value: "2025-03-15" },
        WorkPeriod: { value: "11" },
        DateType: { text: "工作日" }
      },
      {
        SwipingCardDate: { value: "2025-03-16" },
        WorkPeriod: { value: "6" },
        DateType: { text: "公休日" }
      },
      {
        SwipingCardDate: { value: "2025-03-17" },
        WorkPeriod: { value: "9" },
        DateType: { text: "工作日" }
      }
    ]
  };
  const ot = apiSandbox.parseItalentAttendance(attendanceData, 2025, 3, false, { italent_standard_work_hours: 9 });
  // 3-15: 工作日 11h - 9h = 2h 加班
  // 3-16: 公休日 6h 全部算加班
  // 3-17: 工作日 9h - 9h = 0h
  assertEqual(ot["2025-03-15"], 2, "工作日 11h 应有 2h 加班");
  assertEqual(ot["2025-03-16"], 6, "公休日 6h 应全部算加班");
  assert(!ot["2025-03-17"], "工作日 9h 无加班");

  // parseItalentAttendance 兼容旧版 pageList
  const legacyAttendance = {
    pageList: [
      { SwipingCardDate: "2025-03-20", WorkPeriod: "10.0", DateType: "工作日" }
    ]
  };
  const otLegacy = apiSandbox.parseItalentAttendance(legacyAttendance, 2025, 3, false, { italent_standard_work_hours: 9 });
  assertEqual(otLegacy["2025-03-20"], 1, "兼容 pageList 格式考勤解析 (10h-9h=1h)");

  // pickTransition with last=true
  const multiTransitions = [
    { name: "流转", uuid: "tr_first" },
    { name: "流转", uuid: "tr_last" }
  ];
  assertEqual(apiSandbox.pickTransition(multiTransitions, "流转", "", null, true).uuid, "tr_last", "last=true 应选取最后一个匹配流转");

  // readItalentCookies 从 chrome mock 读取
  apiSandbox.chrome._setCookies([
    { name: "session", value: "italent-session-abc", domain: "cloud.italent.cn" },
    { name: "quark_s", value: "quark-xyz", domain: ".italent.cn" },
    { name: "vid", value: "vid-123", domain: "www.italent.cn" },
    { name: "ones-lt", value: "ones-token", domain: "ones.reachauto.com" }  // 应被过滤
  ]);
  const italentCookies = await apiSandbox.readItalentCookies();
  assert(italentCookies.hasCookie, "readItalentCookies 应检测到 cookie");
  assert(italentCookies.cookieStr.includes("italent-session-abc"), "cookieStr 应包含 session");
  assert(italentCookies.cookieStr.includes("quark_s=quark-xyz"), "cookieStr 应包含 quark_s");
  assert(!italentCookies.cookieStr.includes("ones-lt"), "cookieStr 不应包含 ones 域的 cookie");
  assertEqual(italentCookies.quark_s, "quark-xyz", "应单独暴露 quark_s");
  assertEqual(italentCookies.vid, "vid-123", "应单独暴露 vid");

  // 空北森 cookie 场景
  apiSandbox.chrome._setCookies([]);
  const emptyItalent = await apiSandbox.readItalentCookies();
  assert(!emptyItalent.hasCookie, "无北森 cookie 时 hasCookie 应为 false");
  assertEqual(emptyItalent.cookieStr, "", "无 cookie 时 cookieStr 应为空");

  // --- i18n.js ---
  console.log("\n[i18n.js]");
  const i18nSandbox = createSandbox();
  // i18n.js 依赖 document，需要 mock
  i18nSandbox.document = {
    querySelectorAll: () => []
  };
  vm.runInContext(loadSource(path.join(SRC_DIR, "i18n.js")), i18nSandbox);

  // t() 函数：chrome.i18n.getMessage 返回 key（mock）
  assertEqual(i18nSandbox.t("extName", "fallback"), "extName", "t() 有 chrome.i18n 时应返回 getMessage 结果");
  // 移除 chrome.i18n 测试 fallback
  delete i18nSandbox.chrome.i18n;
  assertEqual(i18nSandbox.t("extName", "fallback"), "fallback", "t() 无 chrome.i18n 时应返回 fallback");

  // --- engine.js ---
  console.log("\n[engine.js]");
  const engineSandbox = createSandbox();
  engineSandbox.distribute = distSandbox.distribute;
  engineSandbox.workingDays = holidaysSandbox.workingDays;
  engineSandbox.findStep = wfSandbox.findStep;
  engineSandbox.eligibleForUpdate = wfSandbox.eligibleForUpdate;
  engineSandbox.eligibleForMonthFullClose = wfSandbox.eligibleForMonthFullClose;
  engineSandbox.loadConfig = cfgSandbox.loadConfig;
  engineSandbox.saveConfig = cfgSandbox.saveConfig;
  vm.runInContext(loadSource(path.join(SRC_DIR, "engine.js")), engineSandbox);

  // 1. 基础默认工时分配
  const t1 = { uuid: "t1", summary: "Task 1", _remaining: 10 };
  const t2 = { uuid: "t2", summary: "Task 2", _remaining: 15 };
  const defHours = engineSandbox.calcDefaultHours([t1, t2], {}, 20, 0);
  assertEqual(defHours["t1"].hours, 10, "Task 1 应分配 10h");
  assertEqual(defHours["t2"].hours, 10, "Task 2 剩余额度仅剩 10h，应分配 10h (总额不超过容量)");

  // 2. 容量已满场景（totalFilled >= capacity）
  const defHoursFull = engineSandbox.calcDefaultHours([t1, t2], {}, 160, 160);
  assertEqual(defHoursFull["t1"].hours, 0, "月度已满时 Task 1 默认工时应为 0");
  assertEqual(defHoursFull["t2"].hours, 0, "月度已满时 Task 2 默认工时应为 0");

  // 3. 任务剩余工时为 0 / 无预计工时场景
  const tZero = { uuid: "t0", summary: "Zero Rem Task", _remaining: 0 };
  const defHoursZero = engineSandbox.calcDefaultHours([tZero], {}, 160, 0);
  assertEqual(defHoursZero["t0"].hours, 0, "剩余预计为 0 的任务默认工时应为 0");

  // 4. 小数工时四舍五入与已填工时保留
  const tDec1 = { uuid: "td1", summary: "Dec 1", _remaining: 7.5 };
  const tDec2 = { uuid: "td2", summary: "Dec 2", _remaining: 4.5 };
  const defHoursDec = engineSandbox.calcDefaultHours([tDec1, tDec2], { td1: 16.0 }, 160, 16.0);
  assertEqual(defHoursDec["td1"].hours, 7.5, "小数工时应正确保留一位小数");
  assertEqual(defHoursDec["td1"].filed, 16.0, "已填工时字段应正确保留");
  assertEqual(defHoursDec["td2"].hours, 4.5, "第二个任务小数工时应为 4.5");

  // 5. 阶段2 候选筛选（filterStage2CandidatesAsync）
  const curMonth = new Date().getMonth() + 1;
  const curYear = new Date().getFullYear();
  const todayIso = new Date().toISOString().slice(0, 10);
  const sampleTasks = [
    { uuid: "s1", summary: "进行中满工时", _status_name: "进行中", _category: "in_progress", _issue_type: "任务", _plan_end: todayIso, _estimated: 8, _actual: 8 },
    { uuid: "s2", summary: "未开始任务", _status_name: "未开始", _category: "to_do", _issue_type: "任务", _plan_end: todayIso, _estimated: 8, _actual: 0 },
    { uuid: "s3", summary: "已完成任务", _status_name: "已完成", _category: "done", _issue_type: "任务", _plan_end: todayIso, _estimated: 8, _actual: 8 },
    { uuid: "s4", summary: "完成审核中", _status_name: "完成审核中", _category: "in_progress", _issue_type: "工作任务", _plan_end: todayIso, _estimated: 8, _actual: 8 },
  ];
  const stage2List = await engineSandbox.filterStage2CandidatesAsync({}, sampleTasks, curYear, curMonth, {});
  assertEqual(stage2List.length, 1, "阶段2候选应仅匹配'进行中'且工时达标的任务");
  assertEqual(stage2List[0].uuid, "s1", "阶段2候选应为 s1");

  // 6. 阶段3 候选筛选（filterStage3Candidates）
  const stage3List = engineSandbox.filterStage3Candidates({}, sampleTasks, curYear, curMonth);
  assertEqual(stage3List.length, 1, "阶段3候选应仅匹配非'进行中'的 in_progress 任务 (如完成审核中)");
  assertEqual(stage3List[0].uuid, "s4", "阶段3候选应为 s4");

  // 6b. 模拟工时提交后 _actual 与 _remaining 更新
  const taskToUpdate = { uuid: "u1", summary: "WK1", _status_name: "进行中", _category: "in_progress", _issue_type: "任务", _plan_end: todayIso, _estimated: 48, _actual: 43, _remaining: 5 };
  const mockTasks = [taskToUpdate];
  const mockTaskMap = new Map(mockTasks.map(t => [t.uuid, t]));
  const mockOkResult = [{ entry: { task_uuid: "u1", hours: 4 } }, { entry: { task_uuid: "u1", hours: 1 } }];
  for (const r of mockOkResult) {
    const t = mockTaskMap.get(r.entry.task_uuid);
    if (t) {
      t._actual = Math.round(((t._actual || 0) + r.entry.hours) * 100) / 100;
      t._remaining = Math.max(0, Math.round(((t._remaining || 0) - r.entry.hours) * 100) / 100);
    }
  }
  assertEqual(taskToUpdate._actual, 48, "提交 5h 后 _actual 应更新为 48h");
  assertEqual(taskToUpdate._remaining, 0, "提交 5h 后 _remaining 应更新为 0h");
  const stage2UpdatedList = await engineSandbox.filterStage2CandidatesAsync({}, mockTasks, curYear, curMonth);
  assertEqual(stage2UpdatedList.length, 1, "工时更新后应符合阶段2候选要求");

  // 7. 辅助函数测试 (dateToStr, weekdayName)
  assertEqual(engineSandbox.dateToStr(new Date(2026, 7, 26)), "2026-08-26", "dateToStr 应输出标准 YYYY-MM-DD");
  assert(engineSandbox.weekdayName("2026-08-26").startsWith("周"), "weekdayName 应返回有效星期文本");

  // --- 静态检查：manifest.json ---
  console.log("\n[manifest.json]");
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT_DIR, "manifest.json"), "utf-8"));
  assertEqual(manifest.manifest_version, 3, "manifest_version 应为 3");
  assertEqual(manifest.default_locale, "zh_CN", "default_locale 应为 zh_CN");
  assert(manifest.name === "__MSG_extName__", "name 应使用 __MSG_extName__");
  assert(manifest.description === "__MSG_extDescription__", "description 应使用 __MSG_extDescription__");
  assert(manifest.permissions.includes("cookies"), "应声明 cookies 权限");
  assert(manifest.permissions.includes("storage"), "应声明 storage 权限");
  assert(manifest.permissions.includes("alarms"), "应声明 alarms 权限");
  assert(manifest.host_permissions.some(h => h.includes("ones.reachauto.com")), "应声明 ones.reachauto.com host 权限");
  assert(manifest.background.service_worker === "background.js", "service_worker 应为 background.js");
  assert(manifest.background.type === "module", "background type 应为 module");

  // --- 静态检查：_locales 文件 ---
  console.log("\n[_locales]");
  const zhCN = JSON.parse(fs.readFileSync(path.join(EXT_DIR, "_locales", "zh_CN", "messages.json"), "utf-8"));
  const en = JSON.parse(fs.readFileSync(path.join(EXT_DIR, "_locales", "en", "messages.json"), "utf-8"));
  assert(zhCN.extName && zhCN.extName.message, "zh_CN 应有 extName");
  assert(en.extName && en.extName.message, "en 应有 extName");
  // 检查两语言 key 一致性
  const zhKeys = Object.keys(zhCN).sort();
  const enKeys = Object.keys(en).sort();
  assertEqual(zhKeys, enKeys, "zh_CN 与 en 的 key 应一致");

  // === 总结 ===
  console.log("\n========================================");
  console.log(`测试结果: ${passCount} 通过, ${failCount} 失败`);
  if (failCount > 0) {
    console.log("\n失败用例:");
    failures.forEach(f => console.log(`  - ${f}`));
  }
  console.log("========================================\n");
  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error("测试运行异常:", e);
  process.exit(1);
});
