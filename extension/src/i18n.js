// i18n.js — 国际化辅助：自动为 data-i18n 元素注入文案，并提供 getMessage 包装

// chrome.i18n.getMessage 的包装：失败时返回 fallback
export function t(key, fallback = "") {
  try {
    if (typeof chrome !== "undefined" && chrome.i18n && typeof chrome.i18n.getMessage === "function") {
      const msg = chrome.i18n.getMessage(key);
      if (msg) return msg;
    }
  } catch (e) { /* ignore */ }
  return fallback;
}

// 为所有带 data-i18n 属性的元素注入对应文案
// 如果元素有 data-i18n-ph 属性，则注入为 placeholder
export function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    const fallback = el.textContent || "";
    const msg = t(key, fallback);
    if (msg) el.textContent = msg;
  });
  root.querySelectorAll("[data-i18n-ph]").forEach(el => {
    const key = el.getAttribute("data-i18n-ph");
    if (!key) return;
    const fallback = el.getAttribute("placeholder") || "";
    const msg = t(key, fallback);
    if (msg) el.setAttribute("placeholder", msg);
  });
  // title 属性
  root.querySelectorAll("[data-i18n-title]").forEach(el => {
    const key = el.getAttribute("data-i18n-title");
    if (!key) return;
    const fallback = el.getAttribute("title") || "";
    const msg = t(key, fallback);
    if (msg) el.setAttribute("title", msg);
  });
}
