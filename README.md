# TonyTamperMonkey

Tampermonkey userscripts for truck dispatch work — DAT One, Apex Capital Corp, and Motion TMS (USKO dispatch). This repo is public, so anyone on the team can install the scripts straight from here — no GitHub account needed.

## Scripts

| Script | Version | Runs on | What it does |
|---|---|---|---|
| DAT to Apex - MC Checker + Route Tools | 6.2 | one.dat.com, amp.apexcapitalcorp.com | Adds CHECK APEX buttons next to broker MC numbers on DAT. Clicking opens Apex, auto-fills and submits the credit check, then paints the DAT button with the verdict (OK / RISK / CHECKED). Verdicts older than 24 hours paint amber as STALE — click to re-check. Also adds Copy Route and Open Google Maps buttons. |
| DAT One – Rate-Per-Mile Badges | 1.1 | one.dat.com | Shows $/mile badges on DAT loads. Loaded $/mi uses DAT's own trip miles (zip-code estimate as fallback); also shows an all-in $/mi that includes DAT's deadhead from your search origin. Full breakdown in the tooltip. |
| DAT One – City Zip Code Injector | 3.0 | one.dat.com | Shows zip codes next to city names in load rows and the detail panel on DAT One. |
| MotionTMS Copy Trucks iPad Manual Copy | 1.4 | express.motiontms.com | "Copy Trucks" button on the Available Trucks page. Groups available trucks by date into a selectable text box (built for manual copy on iPad Safari), formatted as tab-separated columns by date, ready to paste into the truck board. |
| Motion TMS - Copy Pending Loads | 1.0 | express.motiontms.com/loads/pending-list | Adds a button to copy all visible pending loads from the Pending Loads page. |
| Motion Express - Past Due In-Transit Loads | 1.0 | express.motiontms.com/loads/in-transit-list | Highlights and copies in-transit/dispatched loads whose delivery date is before today. |
| MotionTMS Max Rows & My Group (No Auto-Paging) | 7.0 | express.motiontms.com | Forces "My Group" and sets max rows per page on Motion pages, but leaves pagination to the user (no auto-paging). |
| TM Script Manager | 1.1 | Tampermonkey dashboard | When you open the Tampermonkey dashboard, it checks this repo's `registry.json` and shows a panel with any scripts you don't have yet and any updates for scripts you do have, each with a one-click Install/Update button. |

## For coworkers: install everything (5 minutes, one time)

1. Install the **Tampermonkey** extension in your browser: https://www.tampermonkey.net/
2. Install the **TM Script Manager** — open this link and click **Install** on the Tampermonkey page that appears:
   https://raw.githubusercontent.com/Tony-KDC/TonyTamperMonkey/refs/heads/main/tm-manager.user.js
3. Click the Tampermonkey icon in your browser → **Dashboard**. The Script Manager panel pops up in the top-right.
4. Click **Install / Update All**, then click **Install** in each Tampermonkey tab that opens. (If your browser blocks some tabs, click the remaining buttons in the panel one by one.)
5. Done. The scripts start working on DAT / Motion / Apex as soon as you open those sites.

## Getting updates after that

Two ways, both work — a script fix only reaches you if its version number went up, and every fix in this repo bumps the version:

- **Script Manager panel:** open the Tampermonkey dashboard (step 3 above). If a newer version is in the repo, the panel lists it as an orange **Update** button (e.g. "Update: v1.3 → v1.4"). Click it and confirm.
- **Tampermonkey's built-in updater:** every script here carries an `@updateURL` pointing at its file in this repo, so Tampermonkey can also update scripts itself. In the dashboard, open the **Settings** tab and set **Check Interval** to *Daily*; or any time, click the Tampermonkey icon → **Check for userscript updates**.

## How this repo stays in sync

- `registry.json` is the index the TM Script Manager reads. One entry per script, with `name`, `version`, `description`, and `downloadURL`. The name and version must match the script's `@name` / `@version` header exactly, and the download URL must be the script file's raw URL on `main`.
- Every script header carries matching `@updateURL` / `@downloadURL` lines pointing at its own raw file — that's what Tampermonkey's built-in updater uses.
- When a script changes: bump its `@version`, update its version in `registry.json` and in the table above, all in the same commit.

## Notes

- Scripts are plain JavaScript with a standard Tampermonkey header (`// ==UserScript==`). No build step.
- Site updates break things from time to time (DAT, Apex, and Motion all redesign their pages — e.g. Motion's October 2026 switch to a Material table is what Copy Trucks v1.4 fixes). When a button stops working, the fix is usually updating the selectors in that one script to match the new page markup.
