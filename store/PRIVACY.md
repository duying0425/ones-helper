# Privacy Policy — ONES Helper

Last updated: 2026-07-31

This privacy policy explains how the **ONES Helper** browser extension ("the extension") handles data. The extension is open source, and its source code is available at https://github.com/duying0425/ones-helper.

## 1. Overview

The extension is designed with a strict **local-first, no-tracking** principle. It does **not** collect, store, or transmit any personal data to the developer or any third-party server. All processing happens locally in your browser.

## 2. What data the extension accesses

The extension operates on `ones.reachauto.com` and `cloud.italent.cn` / `www.italent.cn` domains, and accesses the following data, all of which stays in your browser:

| Data | Purpose | Stored? | Transmitted? |
|---|---|---|---|
| ONES session cookies (`ones-lt`, `ones-ids-sid`, `ones-uid`) on `ones.reachauto.com` | Authenticate requests to ONES GraphQL / OQL / status transition APIs | Only `ones-lt` cached in `chrome.storage.local` as fallback; auto-refreshed when expired | Only sent to `ones.reachauto.com` as part of API requests |
| Italent cookie (manually pasted by user in Options) | Authenticate requests to Beisen attendance API to fetch overtime hours | Stored in `chrome.storage.local` (user-configurable, deletable) | Only sent to `cloud.italent.cn` / `www.italent.cn` |
| ONES task data (task list, hours, status) | Displayed in dashboard for planning; user edits hours and submits | Not stored (only kept in memory during the session) | Submitted hours sent to `ones.reachauto.com` via GraphQL `addManhour` |
| Workflow / holiday / capacity configuration | User-configured in Options page | Stored in `chrome.storage.local` (user-controllable) | Never transmitted |

## 3. Permissions and why each is required

- **`cookies`** — Reads your existing ONES login session cookies (`ones-lt`, `ones-ids-sid`, `ones-uid`) on `ones.reachauto.com` so the extension can call ONES APIs on your behalf. Without these cookies, the API returns 401 Unauthorized. The cookies are never read by, or sent to, any party other than `ones.reachauto.com`.
- **`storage`** — Saves user configuration (workflow definitions, holiday patches, Beisen cookie, cached user name, etc.) in `chrome.storage.local`. The extension does not sync this data to any cloud account.
- **`alarms`** — Schedules a periodic check (every 30 minutes) to detect ONES token expiration and attempt auto-refresh before it expires, so the user does not have to re-login manually.
- **`activeTab`** — Reads the URL of the active tab when navigating `ones.reachauto.com` to automatically extract the ONES `team_uuid` parameter from the address bar, saving manual configuration effort.
- **`scripting`** — Reserved for executing helper scripts in the active tab context when DOM elements or session variables need to be inspected directly.
- **Host permission `https://ones.reachauto.com/*`** — Required to (1) read the ONES session cookies, (2) call the ONES GraphQL / OQL / status transition APIs, and (3) submit work hours via `addManhour` mutation.
- **Host permissions `https://cloud.italent.cn/*` and `https://www.italent.cn/*`** — Required to call the Beisen attendance API to fetch overtime hours data (only active when the user has manually configured the Italent cookie in Options).

## 4. What the extension does NOT do

- Does **not** collect analytics, telemetry, or usage data.
- Does **not** include any third-party analytics or advertising SDK.
- Does **not** upload, sync, or back up your data to any server (including the developer's).
- Does **not** read or modify any data outside the declared host permissions.
- Does **not** access, read, or list your local files.
- Does **not** execute any remote code. All JavaScript is bundled inside the extension package and runs locally.

## 5. Data retention

The extension retains only the following data in `chrome.storage.local`:

- **User configuration** (workflow, holidays, Beisen cookie, etc.) — until the user explicitly deletes it via Options or by uninstalling the extension.
- **Cached `ones-lt` token** — automatically overwritten on each refresh; cleared when the user logs out of ONES in the browser.

No other data is retained. The extension does not write any files to disk.

## 6. Third-party services

The extension makes network requests **only** to:

- `ones.reachauto.com` (the ONES project management platform you are already using)
- `cloud.italent.cn` / `www.italent.cn` (the Beisen attendance platform, only when the user has configured the Italent cookie)

It does not communicate with any other server. Your use of ONES and Beisen is governed by their respective terms and privacy policies.

## 7. Open source

The extension is 100% open source. You can audit every line of code at:
https://github.com/duying0425/ones-helper

## 8. Changes to this policy

Any changes to this privacy policy will be posted in this file on the GitHub repository and reflected in the extension's next release.

## 9. Contact

If you have questions about this privacy policy, please open an issue at:
https://github.com/duying0425/ones-helper/issues
