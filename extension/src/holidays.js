// holidays.js — 节假日数据（移植自 Python _HOLIDAYS）
// off: 法定假日中的平日（需要休息）
// on:  补班日（周末需要上班）
// 2025 数据来自国务院官方通知；2026 为估算，可在 options 的 extra_holidays 中覆盖

export const HOLIDAYS = {
  2025: {
    off: new Set([
      "2025-01-01",
      "2025-01-28", "2025-01-29", "2025-01-30", "2025-01-31",
      "2025-02-01", "2025-02-02", "2025-02-03", "2025-02-04",
      "2025-04-04", "2025-04-05", "2025-04-06",
      "2025-05-01", "2025-05-02", "2025-05-03", "2025-05-04", "2025-05-05",
      "2025-06-02",
      "2025-10-01", "2025-10-02", "2025-10-03", "2025-10-04",
      "2025-10-05", "2025-10-06", "2025-10-07", "2025-10-08"
    ]),
    on: new Set([
      "2025-01-26", "2025-02-08", "2025-04-27",
      "2025-09-28", "2025-10-11"
    ])
  },
  2026: {
    off: new Set([
      "2026-01-01", "2026-01-02",
      "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20", "2026-02-23",
      "2026-04-06",
      "2026-05-01", "2026-05-04", "2026-05-05",
      "2026-06-19",
      "2026-09-25",
      "2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07"
    ]),
    on: new Set([
      "2026-01-04", "2026-02-14", "2026-02-28",
      "2026-05-09", "2026-09-20", "2026-10-10"
    ])
  }
};

// 合并内置节假日 + config 中的自定义节假日，返回 {off: Set, on: Set}
export function holidaySets(year, cfg) {
  const base = HOLIDAYS[year] || { off: new Set(), on: new Set() };
  const off = new Set(base.off);
  const on = new Set(base.on);

  const extra = (cfg && cfg.extra_holidays) || {};
  (extra.off || []).forEach(d => off.add(d));
  (extra.on || []).forEach(d => on.add(d));
  (extra.remove_off || []).forEach(d => off.delete(d));
  (extra.remove_on || []).forEach(d => on.delete(d));

  return { off, on };
}

// 返回指定月份的实际工作日列表（Date 对象数组）
export function workingDays(year, month, cfg) {
  const { off, on } = holidaySets(year, cfg);
  const days = [];
  const lastDay = new Date(year, month, 0).getDate();
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, month - 1, day);
    const ds = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const weekday = d.getDay(); // 0=周日, 6=周六
    const isWeekend = weekday === 0 || weekday === 6;
    if (on.has(ds)) {
      days.push(d);
    } else if (isWeekend) {
      continue;
    } else if (off.has(ds)) {
      continue;
    } else {
      days.push(d);
    }
  }
  return days;
}
