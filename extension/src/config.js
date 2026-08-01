// config.js — 配置管理（基于 chrome.storage.local，对应 Python 的 config.json）

const DEFAULT_CONFIG = {
  team_uuid: "SpBJdKsD",
  org_uuid: "6ZKXo9yg",
  // ONES Cookie 字段（扩展中可自动从浏览器读取，这里作为缓存/覆盖）
  user_id: "",
  auth_token: "",
  session_id: "",
  // 北森考勤（可选）—— 所有字段由扩展自动探测并缓存，无需用户填写
  italent_user_id: "",
  italent_user_text: "",
  italent_vid: "",
  italent_standard_work_hours: 9,
  italent_api_url: "https://cloud.italent.cn/api/v2/UI/TableList?viewName=Attendance.SingleObjectListView.EmpAttendanceDataList&metaObjName=Attendance.AttendanceStatistics&app=Attendance&PaaS-SourceApp=Attendance&PaaS-CurrentView=Attendance.AttendanceDataRecordNavView&frontendVersion=2025121900&shadow_context=%7BappModel%3A%22italent%22%2Cuppid%3A%221%22%7D&_qsrcapp=attendance",
  // 加班
  overtime_daily_max: 4,
  // 节假日补丁
  extra_holidays: { off: [], on: [], remove_off: [], remove_on: [] },
  // 工作流
  workflow: {
    "任务": [
      { status: "未开始", button: "开始任务" },
      { status: "进行中", button: "完成任务", comment: "已经完成啦" },
      { status: "已完成" }
    ],
    "工作任务": [
      { status: "未开始",     button: "开始任务" },
      { status: "进行中",     button: "完成审核中", comment: "已经完成啦" },
      { status: "完成审核中", button: "已完成", comment: "已经完成啦" },
      { status: "已完成" }
    ]
  }
};

// 读取配置：合并默认值 + storage 中的覆盖值
export async function loadConfig() {
  const stored = await chrome.storage.local.get("config");
  const cfg = { ...DEFAULT_CONFIG, ...(stored.config || {}) };
  return cfg;
}

// 保存配置（部分更新）
export async function saveConfig(updates) {
  const cfg = await loadConfig();
  const merged = { ...cfg, ...updates };
  await chrome.storage.local.set({ config: merged });
  return merged;
}

// 全量保存配置（替换）
export async function saveFullConfig(cfg) {
  await chrome.storage.local.set({ config: cfg });
}

// 重置为默认配置
export async function resetConfig() {
  await chrome.storage.local.set({ config: { ...DEFAULT_CONFIG } });
  return { ...DEFAULT_CONFIG };
}

export { DEFAULT_CONFIG };
